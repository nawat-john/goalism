import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "../common/jwt-auth.guard";

/**
 * Secrets/TTLs are passed per sign+verify call in AuthService and JwtAuthGuard
 * (access and refresh use different secrets), so JwtModule is registered with
 * no global config — it only provides the JwtService.
 *
 * Global so every feature module can use `@UseGuards(JwtAuthGuard)` without
 * re-importing JwtModule.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
