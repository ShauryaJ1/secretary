import { router } from './init';
import { userRouter } from './routers/user';
import { composioRouter } from './routers/composio';

export const appRouter = router({
  user: userRouter,
  composio: composioRouter,
});

export type AppRouter = typeof appRouter;



