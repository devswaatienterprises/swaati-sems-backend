import { Request } from 'express';

// -------------------------------------------------------
// Verification Result Types
// -------------------------------------------------------
export type VerificationResult =
  | 'VERIFIED'
  | 'IP_MISMATCH'
  | 'IP_UNAVAILABLE'
  | 'LOCATION_MISMATCH'
  | 'LOCATION_UNAVAILABLE'
  | 'NOT_CONFIGURED';

export interface VerificationEvent {
  method: string;
  ip: string | null;
  ipResult: VerificationResult | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  gpsResult: VerificationResult | null;
  overallResult: VerificationResult;
  reason: string | null;
  capturedAt: string;
  distanceMeters?: number | null;
}

// -------------------------------------------------------
// Extract the real public IP from the request
// -------------------------------------------------------
export function extractPublicIP(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0])
      .split(',')
      .map((s) => s.trim());
    const publicIP = ips.find((ip) => !isPrivateIP(ip));
    if (publicIP) return publicIP;
  }
  const remoteAddr = (req.socket as any)?.remoteAddress || (req.connection as any)?.remoteAddress;
  if (remoteAddr) {
    const clean = remoteAddr.replace(/^::ffff:/, '');
    if (!isPrivateIP(clean)) return clean;
  }
  return null;
}

function isPrivateIP(ip: string): boolean {
  if (!ip) return true;
  const clean = ip.replace(/^::ffff:/, '');
  return (
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean === 'localhost' ||
    /^10\./.test(clean) ||
    /^192\.168\./.test(clean) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(clean) ||
    /^169\.254\./.test(clean)
  );
}

export function verifyIP(
  clientIP: string | null,
  approvedIPsString: string | null | undefined
): { result: VerificationResult; reason: string | null } {
  if (!clientIP) {
    return { result: 'IP_UNAVAILABLE', reason: 'Could not determine public IP from request' };
  }
  if (!approvedIPsString || !approvedIPsString.trim()) {
    return { result: 'IP_UNAVAILABLE', reason: 'No approved IPs configured for this employee' };
  }
  const approvedList = approvedIPsString
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (approvedList.includes(clientIP)) {
    return { result: 'VERIFIED', reason: null };
  }
  return {
    result: 'IP_MISMATCH',
    reason: `Request IP ${clientIP} not in approved list: [${approvedList.join(', ')}]`,
  };
}

function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function verifyGPS(
  lat: number | null | undefined,
  lng: number | null | undefined,
  accuracy: number | null | undefined,
  approvedLat: number | null | undefined,
  approvedLng: number | null | undefined,
  radiusMeters: number
): { result: VerificationResult; distanceMeters: number | null; reason: string | null } {
  if (lat == null || lng == null) {
    return { result: 'LOCATION_UNAVAILABLE', distanceMeters: null, reason: 'GPS coordinates not provided' };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { result: 'LOCATION_UNAVAILABLE', distanceMeters: null, reason: 'Invalid GPS coordinates received' };
  }
  if (approvedLat == null || approvedLng == null) {
    return { result: 'LOCATION_UNAVAILABLE', distanceMeters: null, reason: 'No approved office location configured' };
  }
  const distance = Math.round(haversineDistanceMeters(lat, lng, approvedLat, approvedLng));
  if (distance <= radiusMeters) {
    return { result: 'VERIFIED', distanceMeters: distance, reason: `Within ${radiusMeters}m radius (actual: ${distance}m)` };
  }
  return { result: 'LOCATION_MISMATCH', distanceMeters: distance, reason: `${distance}m from office (allowed: ${radiusMeters}m radius)` };
}

export interface GPSInput {
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  capturedAt?: string | null;
  unavailable?: boolean;
}

export function buildVerificationPayload(
  method: string,
  req: Request,
  gpsInput: GPSInput,
  employee: {
    approvedIPs?: string | null;
    approvedLat?: number | null;
    approvedLng?: number | null;
    approvedRadiusMeters?: number | null;
  }
): VerificationEvent {
  const now = new Date().toISOString();
  const clientIP = extractPublicIP(req);

  if (!method || method === 'NONE') {
    return {
      method: 'NONE', ip: null, ipResult: null, lat: null, lng: null,
      accuracy: null, gpsResult: null, overallResult: 'NOT_CONFIGURED',
      reason: 'No verification method configured', capturedAt: now,
    };
  }

  const radius = employee.approvedRadiusMeters ?? 200;
  let ipResult: VerificationResult | null = null;
  let ipReason: string | null = null;
  let gpsResult: VerificationResult | null = null;
  let gpsReason: string | null = null;
  let distanceMeters: number | null = null;

  if (method === 'OFFICE_IP' || method === 'HYBRID') {
    const ip = verifyIP(clientIP, employee.approvedIPs);
    ipResult = ip.result;
    ipReason = ip.reason;
  }

  if (method === 'MOBILE_GPS' || method === 'HYBRID') {
    if (gpsInput.unavailable) {
      gpsResult = 'LOCATION_UNAVAILABLE';
      gpsReason = 'Location permission denied or GPS unavailable';
    } else {
      const gps = verifyGPS(gpsInput.lat, gpsInput.lng, gpsInput.accuracy, employee.approvedLat, employee.approvedLng, radius);
      gpsResult = gps.result;
      gpsReason = gps.reason;
      distanceMeters = gps.distanceMeters;
    }
  }

  let overallResult: VerificationResult;
  let combinedReason: string | null = null;

  if (method === 'OFFICE_IP') {
    overallResult = ipResult!;
    combinedReason = ipReason;
  } else if (method === 'MOBILE_GPS') {
    overallResult = gpsResult!;
    combinedReason = gpsReason;
  } else {
    // HYBRID: GPS is primary; IP is supplementary
    if (gpsResult === 'VERIFIED') {
      overallResult = 'VERIFIED';
    } else if (gpsResult === 'LOCATION_MISMATCH') {
      overallResult = 'LOCATION_MISMATCH';
      combinedReason = gpsReason;
    } else if (gpsResult === 'LOCATION_UNAVAILABLE') {
      overallResult = ipResult === 'VERIFIED' ? 'VERIFIED' : (ipResult ?? 'LOCATION_UNAVAILABLE');
      combinedReason = ipResult === 'VERIFIED' ? null : (ipReason || gpsReason);
    } else {
      overallResult = ipResult ?? 'NOT_CONFIGURED';
      combinedReason = ipReason;
    }
  }

  return {
    method, ip: clientIP, ipResult, lat: gpsInput.lat ?? null,
    lng: gpsInput.lng ?? null, accuracy: gpsInput.accuracy ?? null,
    gpsResult, overallResult, reason: combinedReason,
    capturedAt: gpsInput.capturedAt ?? now,
    ...(distanceMeters !== null ? { distanceMeters } : {}),
  };
}
