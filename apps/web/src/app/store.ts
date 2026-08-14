import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from '../api/api';
import { authReducer } from '../features/auth/authSlice';
import { workspaceReducer } from '../features/workspace/workspaceSlice';

// Endpoint modules register themselves on `api` as a side effect of being
// imported. They are pulled in here, once, so that a component can call a
// generated hook without also having to remember to import the module that
// defines it.
import '../api/endpoints/accounts';
import '../api/endpoints/analytics';
import '../api/endpoints/auth';
import '../api/endpoints/categories';
import '../api/endpoints/notifications';
import '../api/endpoints/transactions';
import '../api/endpoints/workspaces';

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth: authReducer,
    workspace: workspaceReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

// Enables `refetchOnFocus` / `refetchOnReconnect`.
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
