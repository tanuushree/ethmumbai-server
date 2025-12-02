import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res: Response = context.switchToHttp().getResponse<Response>();
    const providedKey = (req.header('x-scanner-key') || '') as string;

    // read allowed key from env
    const allowed = process.env.SCANNER_KEY || '';

    if (!providedKey || !allowed.includes(providedKey)) {
      res
        .status(HttpStatus.UNAUTHORIZED)
        .type('text/plain')
        .send(
          'The BEST Conference in Mumbai is waiting for you! Use this ticket at the check-in. See you there!',
        );
      return false;
    }
    return true;
  }
}
