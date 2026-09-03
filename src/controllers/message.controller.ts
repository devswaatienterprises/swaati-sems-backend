import { Response } from 'express';
import { prisma } from '../config/db';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../middleware/auth';

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
                      email: true,
                      role: true,
                      employee: { select: { name: true, designation: true, avatar: true } },
                    },
                  },
                },
              },
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
      });

      return ApiResponse.success(res, memberships.map((m) => m.conversation), 'Conversations retrieved');
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

      // Find or create conversation between currentUserId and recipientId
      let memberMatch = await prisma.conversationMember.findFirst({
        where: {
          userId: currentUserId,
          conversation: {
            members: {
              some: { userId: recipientId },
            },
          },
        },
        select: { conversationId: true },
      });

      let conversationId = memberMatch?.conversationId;

      if (!conversationId) {
        // Create conversation and add both members
        const newConversation = await prisma.conversation.create({
          data: {
            members: {
              create: [
                { userId: currentUserId },
                { userId: recipientId },
              ],
            },
          },
        });
        conversationId = newConversation.id;
      }

      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              employee: { select: { name: true, avatar: true } },
            },
          },
        },
      });

      return ApiResponse.success(res, messages, 'Messages retrieved');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  static async sendMessage(req: AuthRequest, res: Response) {
    try {
      const currentUserId = req.user?.id;
      const { recipientId, content } = req.body;

      if (!currentUserId || !recipientId || !content) {
        return ApiResponse.error(res, 'Recipient ID and message content are required', 400);
      }

      // Find or create conversation
      let memberMatch = await prisma.conversationMember.findFirst({
        where: {
          userId: currentUserId,
          conversation: {
            members: {
              some: { userId: recipientId },
            },
          },
        },
        select: { conversationId: true },
      });

      let conversationId = memberMatch?.conversationId;

      if (!conversationId) {
        const newConversation = await prisma.conversation.create({
          data: {
            members: {
              create: [
                { userId: currentUserId },
                { userId: recipientId },
              ],
            },
          },
        });
        conversationId = newConversation.id;
      }

      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: currentUserId,
          content: content.trim(),
        },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              employee: { select: { name: true } },
            },
          },
        },
      });

      return ApiResponse.success(res, message, 'Message delivered', 201);
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
