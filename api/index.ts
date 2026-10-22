import type { Request, Response } from 'express';
import { createApplication } from '../src/bootstrap.js';

let application: ReturnType<typeof createApplication> | undefined;

export default async function handler(request: Request, response: Response) {
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
    const expressInstance = app.getHttpAdapter().getInstance() as (
      req: Request,
      res: Response,
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
