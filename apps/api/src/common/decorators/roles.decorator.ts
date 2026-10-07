import { SetMetadata } from "@nestjs/common";
import { Papel } from "@salao-saas/shared";

export const ROLES_KEY = "roles";

// Uso: @Roles(Papel.SALAO_ADMIN, Papel.SAAS_ADMIN)
export const Roles = (...papeis: Papel[]) => SetMetadata(ROLES_KEY, papeis);
