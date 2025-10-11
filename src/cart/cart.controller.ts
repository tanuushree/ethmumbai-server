import { Controller, Post, Body, Param } from '@nestjs/common';
import { CartService } from './cart.service';

@Controller('cart')
export class CartController {
    constructor(private readonly cartService: CartService) { }

    // POST /cart → create a new cart
    @Post()
    async createCart(@Body() body: { ticketId: number; quantity: number }) {
        const cart = await this.cartService.createCart(body.ticketId, body.quantity);
        return {
            cart_id: cart.id,
            ticketId: cart.ticketId,
            quantity: cart.quantity,
        };
    }

    // POST /cart/:cart_id/buyer-info → add participants
    @Post(':cartId/buyer-info')
    async addParticipants(
        @Param('cartId') cartId: string,
        @Body() body: { participants: { name: string; email?: string; phone: string; isBuyer?: boolean }[] }, // ✅ phone required
    ) {
        const result = await this.cartService.addParticipants(cartId, body.participants);
        return result;
    }
}
