// Kontrak autentikasi & otorisasi: mode sensor, peran, izin, dan skema API auth/akun.
import { z } from 'zod';

/** Mode sensor: `lab` (data simulasi) atau `production` (trafik internet nyata). */
export const NEXA_MODES = ['lab', 'production'] as const;
export const NexaModeSchema = z.enum(NEXA_MODES);
export type NexaMode = z.infer<typeof NexaModeSchema>;

export const LAB_LABEL = 'Data simulasi lab';
export const PRODUCTION_LABEL = 'Trafik nyata (produksi)';
export const DataLabelSchema = z.enum([LAB_LABEL, PRODUCTION_LABEL]);
export type DataLabel = z.infer<typeof DataLabelSchema>;

/** Label data yang jujur per mode (AGENTS.md §2.11). */
export function dataLabel(mode: NexaMode): DataLabel {
  return mode === 'production' ? PRODUCTION_LABEL : LAB_LABEL;
}

/** Peran pengguna, dari yang paling luas ke paling sempit. */
export const ROLES = ['admin', 'operator', 'analyst', 'viewer'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  admin: 'Admin',
  operator: 'Operator',
  analyst: 'Analis',
  viewer: 'Pemantau',
};

export const ROLE_DESCRIPTIONS: Readonly<Record<Role, string>> = {
  admin: 'Semua akses: pengguna, pengaturan, tagihan, audit, dan keputusan aturan.',
  operator: 'Memantau dan menyetujui/menolak draf aturan.',
  analyst: 'Memantau, membaca intelijen, ekspor aturan, dan token API (MCP).',
  viewer: 'Hanya melihat dashboard, sesi, intelijen, dan aturan.',
};

/** Matriks izin. Server memeriksa setiap rute; dashboard hanya menyembunyikan aksi. */
export const PERMISSIONS = {
  'dashboard:read': ['admin', 'operator', 'analyst', 'viewer'],
  'rules:decide': ['admin', 'operator'],
  'rules:export': ['admin', 'operator', 'analyst'],
  'tokens:manage': ['admin', 'operator', 'analyst'],
  'users:manage': ['admin'],
  'settings:manage': ['admin'],
  'billing:manage': ['admin'],
  'audit:read': ['admin'],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return (
    role !== null &&
    role !== undefined &&
    (PERMISSIONS[permission] as readonly Role[]).includes(role)
  );
}

/** Cakupan token API: `read` tidak bisa mengubah apa pun walau pemiliknya admin. */
export const TOKEN_SCOPES = ['read', 'write'] as const;
export const TokenScopeSchema = z.enum(TOKEN_SCOPES);
export type TokenScope = z.infer<typeof TokenScopeSchema>;

export const PrincipalSchema = z.object({
  kind: z.enum(['user', 'service', 'api_token']),
  userId: z.string().nullable(),
  name: z.string(),
  email: z.string().nullable(),
  role: RoleSchema,
  isOwner: z.boolean(),
  totpEnabled: z.boolean(),
  scope: TokenScopeSchema,
});
export type Principal = z.infer<typeof PrincipalSchema>;

export const AuthStatusSchema = z.object({
  mode: NexaModeSchema,
  label: DataLabelSchema,
  orgName: z.string(),
  /** Belum ada akun: layar masuk menampilkan penyiapan pemilik (butuh SETUP_TOKEN). */
  needsSetup: z.boolean(),
  setupAvailable: z.boolean(),
  principal: PrincipalSchema.nullable(),
  /** Admin wajib 2FA tapi belum mengaktifkannya: dashboard mengarahkan ke Akun. */
  mustEnable2fa: z.boolean(),
});
export type AuthStatus = z.infer<typeof AuthStatusSchema>;

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email('alamat email tidak valid');

export const PasswordSchema = z
  .string()
  .min(10, 'kata sandi minimal 10 karakter')
  .max(128, 'kata sandi maksimal 128 karakter');

export const PersonNameSchema = z
  .string()
  .trim()
  .min(2, 'nama minimal 2 karakter')
  .max(64)
  .regex(/^[\p{L}\p{N} ._'-]+$/u, 'nama mengandung karakter tidak valid');

export const TotpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'kode 2FA harus 6 digit');

export const LoginInputSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'isi kata sandi').max(200),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const LoginResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), principal: PrincipalSchema }),
  z.object({ status: z.literal('totp_required'), challenge: z.string() }),
]);
export type LoginResult = z.infer<typeof LoginResultSchema>;

export const TotpLoginInputSchema = z.object({
  challenge: z.string().min(16).max(512),
  code: TotpCodeSchema,
});

export const SetupInputSchema = z.object({
  setupToken: z.string().trim().min(16, 'token penyiapan minimal 16 karakter').max(256),
  orgName: z.string().trim().min(2, 'nama organisasi minimal 2 karakter').max(80),
  name: PersonNameSchema,
  email: EmailSchema,
  password: PasswordSchema,
});
export type SetupInput = z.infer<typeof SetupInputSchema>;

export const AcceptInviteInputSchema = z.object({
  token: z.string().min(16).max(256),
  name: PersonNameSchema,
  password: PasswordSchema,
});

export const InviteInfoSchema = z.object({
  email: z.string(),
  role: RoleSchema,
  orgName: z.string(),
  expiresAt: z.number(),
});
export type InviteInfo = z.infer<typeof InviteInfoSchema>;

export const ResetPasswordInputSchema = z.object({
  token: z.string().min(16).max(256),
  password: PasswordSchema,
});

export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: PasswordSchema,
});

export const ProfileUpdateInputSchema = z.object({ name: PersonNameSchema });

export const TotpSetupSchema = z.object({ secret: z.string(), otpauthUri: z.string() });
export type TotpSetup = z.infer<typeof TotpSetupSchema>;

export const TotpEnableInputSchema = z.object({ code: TotpCodeSchema });
export const TotpDisableInputSchema = z.object({
  password: z.string().min(1).max(200),
  code: TotpCodeSchema,
});

export const LoginSessionSchema = z.object({
  id: z.string(),
  current: z.boolean(),
  createdAt: z.number(),
  lastSeenAt: z.number(),
  expiresAt: z.number(),
  ip: z.string(),
  userAgent: z.string(),
});
export type LoginSession = z.infer<typeof LoginSessionSchema>;
export const LoginSessionListSchema = z.object({ sessions: z.array(LoginSessionSchema) });

export const ApiTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scope: TokenScopeSchema,
  createdAt: z.number(),
  lastUsedAt: z.number().nullable(),
  expiresAt: z.number().nullable(),
});
export type ApiToken = z.infer<typeof ApiTokenSchema>;
export const ApiTokenListSchema = z.object({ tokens: z.array(ApiTokenSchema) });

export const ApiTokenCreateInputSchema = z.object({
  name: z.string().trim().min(2, 'nama token minimal 2 karakter').max(64),
  scope: TokenScopeSchema,
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
});
/** Nilai token hanya dikirim SEKALI saat dibuat; server hanya menyimpan hash-nya. */
export const ApiTokenCreatedSchema = z.object({ token: ApiTokenSchema, secret: z.string() });

export const OkSchema = z.object({ ok: z.literal(true) });
