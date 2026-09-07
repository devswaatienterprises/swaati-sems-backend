import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';
import { R2Service } from '../services/r2.service';

export class MessageController {
  static async getConversations(req: AuthRequest, res: Response) {
    try {
      const currentUserId = req.user?.id;
      if (!currentUserId) {
        return ApiResponse.error(res, 'Unauthenticated', 401);
      }

      const memberships = await prisma.conversationMember.findMany({
        where: { userId: currentUserId },
        include: {
          conversation: {
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      userId: true,
                      email: true,
                      role: true,
                      employee: {
                        select: {
                          id: true,
                          employeeCode: true,
                          name: true,
                          department: true,
                          designation: true,
                          avatar: true,
                        },
                      },
                    },
                  },
                },
              },
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: {
                  sender: {
                    select: {
                      id: true,
                      email: true,
                      employee: { select: { name: true, employeeCode: true, avatar: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
      });

      return ApiResponse.success(
        res,
        memberships.map((m) => m.conversation),
        'Conversations retrieved'
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async getMessages(req: AuthRequest, res: Response) {
    try {
      const currentUserId = req.user?.id;
      const { recipientId } = req.params;

      if (!currentUserId) {
        return ApiResponse.error(res, 'Unauthenticated', 401);
      }

      // Check if recipientId is an existing Conversation ID (e.g., group or direct conversation)
      const existingConvo = await prisma.conversation.findUnique({
        where: { id: recipientId },
        include: {
          members: { where: { userId: currentUserId } },
        },
      });

      let conversationId = '';

      if (existingConvo && existingConvo.members.length > 0) {
        conversationId = existingConvo.id;
      } else {
        // Resolve recipient user ID
        let targetUserId = recipientId;
        const targetUser = await prisma.user.findFirst({
          where: {
            OR: [
              { id: recipientId },
              { userId: recipientId },
              { employee: { id: recipientId } },
              { employee: { employeeCode: recipientId } },
            ],
          },
        });
        if (targetUser) {
          targetUserId = targetUser.id;
        }

        // Find or create conversation between currentUserId and targetUserId
        const memberMatch = await prisma.conversationMember.findFirst({
          where: {
            userId: currentUserId,
            conversation: {
              isGroup: false,
              members: {
                some: { userId: targetUserId },
              },
            },
          },
          select: { conversationId: true },
        });

        if (memberMatch) {
          conversationId = memberMatch.conversationId;
        } else {
          // Create conversation and add both members
          const newConversation = await prisma.conversation.create({
            data: {
              isGroup: false,
              members: {
                create: [
                  { userId: currentUserId },
                  { userId: targetUserId },
                ],
              },
            },
          });
          conversationId = newConversation.id;
        }
      }

      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        include: {
          sender: {
            select: {
              id: true,
              userId: true,
              email: true,
              employee: { select: { id: true, employeeCode: true, name: true, avatar: true } },
            },
          },
        },
      });

      return ApiResponse.success(res, messages, 'Messages retrieved');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async getConversationMessages(req: AuthRequest, res: Response) {
    try {
      const currentUserId = req.user?.id;
      const { conversationId } = req.params;

      if (!currentUserId) {
        return ApiResponse.error(res, 'Unauthenticated', 401);
      }

      const member = await prisma.conversationMember.findFirst({
        where: {
          conversationId,
          userId: currentUserId,
        },
      });

      if (!member) {
        return ApiResponse.error(res, 'Access denied to this conversation', 403);
      }

      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        include: {
          sender: {
            select: {
              id: true,
              userId: true,
              email: true,
              employee: { select: { id: true, employeeCode: true, name: true, avatar: true } },
            },
          },
        },
      });

      return ApiResponse.success(res, messages, 'Conversation messages retrieved');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async createGroup(req: AuthRequest, res: Response) {
    try {
      const currentUserId = req.user?.id;
      const { name, title, memberIds = [], description } = req.body;
      const groupTitle = (name || title || '').trim();

      if (!currentUserId) {
        return ApiResponse.error(res, 'Unauthenticated', 401);
      }
      if (!groupTitle) {
        return ApiResponse.error(res, 'Group title/name is required', 400);
      }

      // Resolve member IDs to User IDs
      const rawIds = Array.from(new Set([...memberIds, currentUserId]));
      const userIdsToAdd = new Set<string>();

      for (const id of rawIds) {
        if (!id) continue;
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { id },
              { userId: id },
              { employee: { id } },
              { employee: { employeeCode: id } },
            ],
          },
          select: { id: true },
        });
        if (user) {
          userIdsToAdd.add(user.id);
        } else {
          userIdsToAdd.add(id);
        }
      }

      // Always ensure current user is added
      userIdsToAdd.add(currentUserId);

      const conversation = await prisma.conversation.create({
        data: {
          title: groupTitle,
          isGroup: true,
          members: {
            create: Array.from(userIdsToAdd).map((userId) => ({ userId })),
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  userId: true,
                  email: true,
                  role: true,
                  employee: {
                    select: {
                      id: true,
                      employeeCode: true,
                      name: true,
                      department: true,
                      designation: true,
                      avatar: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      return ApiResponse.success(res, conversation, 'Group created successfully', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async sendMessage(req: AuthRequest, res: Response) {
    try {
      const currentUserId = req.user?.id;
      const { conversationId: rawConversationId, recipientId, content, message, text } = req.body;
      const messageContent = (content || message || text || '').trim();

      if (!currentUserId || (!rawConversationId && !recipientId) || !messageContent) {
        return ApiResponse.error(res, 'Recipient/Conversation ID and message content are required', 400);
      }

      let conversationId = rawConversationId;

      if (conversationId) {
        // Verify conversation exists and user is a member
        let member = await prisma.conversationMember.findFirst({
          where: { conversationId, userId: currentUserId },
        });

        if (!member) {
          // If conversation exists, add current user as member
          const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
          if (convo) {
            await prisma.conversationMember.create({
              data: { conversationId, userId: currentUserId },
            });
          } else {
            return ApiResponse.error(res, 'Conversation not found', 404);
          }
        }
      } else if (recipientId) {
        // Resolve recipient user ID
        let targetUserId = recipientId;
        const targetUser = await prisma.user.findFirst({
          where: {
            OR: [
              { id: recipientId },
              { userId: recipientId },
              { employee: { id: recipientId } },
              { employee: { employeeCode: recipientId } },
            ],
          },
        });
        if (targetUser) {
          targetUserId = targetUser.id;
        }

        // Find or create direct conversation
        let memberMatch = await prisma.conversationMember.findFirst({
          where: {
            userId: currentUserId,
            conversation: {
              isGroup: false,
              members: {
                some: { userId: targetUserId },
              },
            },
          },
          select: { conversationId: true },
        });

        if (memberMatch) {
          conversationId = memberMatch.conversationId;
        } else {
          const newConversation = await prisma.conversation.create({
            data: {
              isGroup: false,
              members: {
                create: [
                  { userId: currentUserId },
                  { userId: targetUserId },
                ],
              },
            },
          });
          conversationId = newConversation.id;
        }
      }

      let attachmentPath = req.body.attachmentPath || null;

      // Handle multipart attachment upload to Cloudflare R2
      if (req.file) {
        const key = R2Service.generateKey('messages', conversationId, req.file.originalname);
        await R2Service.upload({
          key,
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          metadata: { conversationId, senderId: currentUserId },
        });
        attachmentPath = key;
      }

      const newMessage = await prisma.message.create({
        data: {
          conversationId,
          senderId: currentUserId,
          content: messageContent,
          attachmentPath,
        },
        include: {
          sender: {
            select: {
              id: true,
              userId: true,
              email: true,
              employee: { select: { id: true, employeeCode: true, name: true, avatar: true } },
            },
          },
        },
      });

      return ApiResponse.success(res, newMessage, 'Message delivered', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async getAttachmentSignedUrl(req: AuthRequest, res: Response) {
    try {
      const currentUserId = req.user?.id;
      const { messageId } = req.params;

      if (!currentUserId) {
        return ApiResponse.error(res, 'Unauthenticated', 401);
      }

      const message = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          conversation: {
            include: {
              members: { where: { userId: currentUserId } },
            },
          },
        },
      });

      if (!message || !message.attachmentPath) {
        return ApiResponse.error(res, 'Attachment not found', 404);
      }

      // Ensure requesting user is a member of the conversation
      if (message.conversation.members.length === 0 && req.user?.role !== 'ADMIN') {
        return ApiResponse.error(res, 'Access denied to this message attachment', 403);
      }

      const signedUrl = await R2Service.getSignedDownloadUrl(message.attachmentPath, 1800);

      return ApiResponse.success(
        res,
        {
          messageId: message.id,
          signedUrl,
          attachmentPath: message.attachmentPath,
          expiresInSeconds: 1800,
        },
        'Presigned attachment download URL generated'
      );
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}

