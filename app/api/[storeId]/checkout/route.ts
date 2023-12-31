import Stripe from "stripe";
import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import prismadb from "@/lib/prismadb";
import { getUserFromHeaders } from "@/actions/get-user-from-header";

interface payload {
  addressId: string
  orderProducts: Array<{
    id: string,
    quantity: number
  }>
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST( req: Request, { params }: { params: { storeId: string } } ) {
  const { orderProducts, addressId }:payload = await req.json();
  
  const { userId } = getUserFromHeaders();
  
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 403 });
  }
  if (!orderProducts || orderProducts.length === 0 ) {
    return new NextResponse("Product ids are required", { status: 400 });
  }
  if ( !addressId ) {
    return new NextResponse("address id required", { status: 400 });
  }
  const products = await prismadb.product.findMany({
    where: {
      id: {
        in: orderProducts.map(({id})=> id)
      }
    }
  });
  
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  products.forEach((product, idx) => {
    line_items.push({
      quantity: orderProducts[idx].quantity,
      price_data: {
        currency: 'INR',
        product_data: {
          name: product.name,
        },
        unit_amount: product.price * 100
      }
    });
  });

  const order = await prismadb.order.create({
    data: {
      userId,
      addressId,
      storeId: params.storeId,
      isPaid: false,
      orderItems: {
        create: orderProducts.map(({id, quantity}) => ({
          quantity,
          product: {
            connect: { id }
          }
        }))
      }
    }
  });

  const session = await stripe.checkout.sessions.create({
    line_items,
    mode: 'payment',
    // billing_address_collection: 'required',
    phone_number_collection: {
      enabled: false,
    },
    success_url: `${process.env.FRONTEND_STORE_URL}/cart?success=1`,
    cancel_url: `${process.env.FRONTEND_STORE_URL}/cart?canceled=1`,
    metadata: {
      orderId: order.id
    },
  });

  return NextResponse.json({ url: session.url }, {
    headers: corsHeaders
  });
};
