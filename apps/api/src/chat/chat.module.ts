import { Module } from '@nestjs/common';
import { ChatRateLimiter } from './chat-rate-limiter.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatRateLimiter],
})
export class ChatModule {}
