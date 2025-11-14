import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const providedKey = (req.header('x-scanner-key') || '') as string;

    // read allowed key from env
    const allowed = process.env.SCANNER_KEY || '';

    if (!providedKey || !allowed.includes(providedKey)) {
      throw new UnauthorizedException('Unauthorised access');
    }
    return true;
  }
}
