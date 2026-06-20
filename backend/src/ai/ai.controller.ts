import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  aiProxyGenerateSchema,
  type AiProxyGenerateInput,
} from "@study-planner/shared";
import { AiService } from "./ai.service";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("proxy/generate")
  proxy(
    @Headers("x-user-gemini-key") key: string | undefined,
    @Body(new ZodValidationPipe(aiProxyGenerateSchema)) dto: AiProxyGenerateInput,
  ) {
    if (!key) {
      throw new BadRequestException({
        code: "MISSING_API_KEY",
        message: "Missing x-user-gemini-key header",
      });
    }
    return this.ai.proxyGenerate(key, dto);
  }
}
