import { createApplication } from '../src/bootstrap.js';

type VercelRequest = { url?: string };
type VercelResponse = {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
};

let application: ReturnType<typeof createApplication> | undefined;

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  try {
    const requestPath = request.url?.split('?')[0];
    if (requestPath === '/') {
      response.status(200).json({
        status: 'ok',
        service: 'school-management-backend',
        apiBase: '/api/v1',
      });
      return;
    }

    application ??= createApplication();
    const app = await application;
    const expressInstance = app.getHttpAdapter().getInstance() as unknown as (
      req: VercelRequest,
      res: VercelResponse,
    ) => void;
    expressInstance(request, response);
  } catch (error: unknown) {
    application = undefined;
    console.error(
      '[api] startup failed',
      error instanceof Error ? error.message : 'unknown error',
    );
    response
      .status(500)
      .json({ message: 'Backend configuration or startup error' });
  }
}
