import { handleGatewayRequest } from "../../packages/cloudflare-gateway/src/index.ts";

export const onRequest: PagesFunction<Env> = async (context) => await handleGatewayRequest(context.request, context.env);
