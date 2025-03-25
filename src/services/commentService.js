const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const prisma = new PrismaClient();

class CommentService {
  async getComments(videoId, cursor, limit = 10) {
    try {
      // Convert cursor to Date if provided
      const cursorDate = cursor ? new Date(parseInt(cursor)) : undefined;
      
      // Fetch comments with cursor-based pagination
      const comments = await prisma.comment.findMany({
        take: limit + 1, // Take one extra to determine if there are more results
        where: {
          videoId,
          ...(cursorDate && {
            createdAt: {
              lt: cursorDate
            }
          })
        },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true
            }
          },
          _count: {
            select: {
              likes: true,
              replies: true
            }
          }
        }
      });

      // Determine if there are more results
      const hasMore = comments.length > limit;
      const results = hasMore ? comments.slice(0, -1) : comments;
      
      // Get the cursor for the next page
      const lastComment = results[results.length - 1];
      const nextCursor = hasMore ? lastComment.createdAt.getTime().toString() : null;

      // Transform comments
      const transformedComments = results.map(comment => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        user: comment.user,
        stats: {
          likes: comment._count.likes,
          replies: comment._count.replies
        }
      }));

      return {
        comments: transformedComments,
        nextCursor,
        hasMore
      };
    } catch (error) {
      logger.error('Error fetching comments:', error);
      throw error;
    }
  }

  async addComment(userId, videoId, content) {
    try {
      // Start a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the comment
        const comment = await tx.comment.create({
          data: {
            userId,
            videoId,
            content
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true
              }
            }
          }
        });

        // Update video comment count
        await tx.video.update({
          where: { id: videoId },
          data: {
            commentCount: {
              increment: 1
            }
          }
        });

        // Reward tokens for engagement
        await tx.user.update({
          where: { id: userId },
          data: {
            tokenBalance: {
              increment: 1 // Reward 1 token for commenting
            }
          }
        });

        // Create transaction record
        await tx.transaction.create({
          data: {
            userId,
            videoId,
            amount: 1,
            type: 'COMMENT_REWARD',
            description: 'Reward for commenting'
          }
        });

        return comment;
      });

      return {
        id: result.id,
        content: result.content,
        createdAt: result.createdAt,
        user: result.user,
        stats: {
          likes: 0,
          replies: 0
        }
      };
    } catch (error) {
      logger.error('Error adding comment:', error);
      throw error;
    }
  }

  async deleteComment(userId, commentId) {
    try {
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: { video: true }
      });

      if (!comment) {
        throw new Error('Comment not found');
      }

      if (comment.userId !== userId && comment.video.userId !== userId) {
        throw new Error('Unauthorized to delete this comment');
      }

      // Start a transaction
      await prisma.$transaction(async (tx) => {
        // Delete the comment
        await tx.comment.delete({
          where: { id: commentId }
        });

        // Update video comment count
        await tx.video.update({
          where: { id: comment.videoId },
          data: {
            commentCount: {
              decrement: 1
            }
          }
        });
      });

      return true;
    } catch (error) {
      logger.error('Error deleting comment:', error);
      throw error;
    }
  }

  async likeComment(userId, commentId) {
    try {
      // Check if already liked
      const existingLike = await prisma.commentLike.findUnique({
        where: {
          userId_commentId: {
            userId,
            commentId
          }
        }
      });

      if (existingLike) {
        throw new Error('Comment already liked');
      }

      // Start a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the like
        await tx.commentLike.create({
          data: {
            userId,
            commentId
          }
        });

        // Get updated comment
        return await tx.comment.findUnique({
          where: { id: commentId },
          include: {
            _count: {
              select: {
                likes: true,
                replies: true
              }
            }
          }
        });
      });

      return {
        likes: result._count.likes,
        replies: result._count.replies
      };
    } catch (error) {
      logger.error('Error liking comment:', error);
      throw error;
    }
  }
}

module.exports = new CommentService(); 