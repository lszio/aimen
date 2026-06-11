export const name = '@aimen/auth';

export interface JwtPayload {
  sub: string;
  role: string;
}

export function createAuth(secret: string) {
  return {
    sign: async (payload: JwtPayload): Promise<string> => {
      console.log(`[auth] sign token for ${payload.sub}`);
      return `mock.jwt.${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
    },
    verify: async (token: string): Promise<JwtPayload | null> => {
      console.log(`[auth] verify token`);
      return null; // stub
    },
  };
}