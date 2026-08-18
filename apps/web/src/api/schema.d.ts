/**
 * GENERATED FILE — do not edit.
 *
 * Written by `npm run generate:openapi` (at the repository root) from
 * `docs/openapi.json`, which is itself generated from the running API. Every
 * response shape the client knows about starts life as a Zod schema beside the
 * service that produces it, in `apps/api/src/modules/<domain>/responses.ts`.
 *
 * `src/api/types.ts` is the file to read: it gives the shapes here the names
 * the app uses. Nothing should import this one directly.
 */

export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getHealthReady"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postAuthRegister"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postAuthLogin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postAuthRefresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postAuthLogout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postAuthLogoutAll"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/change-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postAuthChangePassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getAuthMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["deleteUsersMe"];
        options?: never;
        head?: never;
        patch: operations["patchUsersMe"];
        trace?: never;
    };
    "/api/v1/users/me/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getUsersMeExport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/currencies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getCurrencies"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/currencies/rate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getCurrenciesRate"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getNotifications"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/{id}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postNotificationsByIdRead"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/read-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postNotificationsReadAll"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["deleteNotificationsById"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/invitations/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postInvitationsAccept"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getWorkspaces"];
        put?: never;
        post: operations["postWorkspaces"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceId"];
        put?: never;
        post?: never;
        /** @description Requires the `owner` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceId"];
        options?: never;
        head?: never;
        /** @description Requires the `admin` role or higher in the workspace. */
        patch: operations["patchWorkspacesByWorkspaceId"];
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdMembers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/members/{userId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description Requires the `admin` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdMembersByUserId"];
        options?: never;
        head?: never;
        /** @description Requires the `admin` role or higher in the workspace. */
        patch: operations["patchWorkspacesByWorkspaceIdMembersByUserId"];
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/transfer-ownership": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `owner` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdTransferOwnership"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `admin` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdInvitations"];
        put?: never;
        /** @description Requires the `admin` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdInvitations"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/invitations/{invitationId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description Requires the `admin` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdInvitationsByInvitationId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdActivity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAccounts"];
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdAccounts"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAccountsById"];
        put?: never;
        post?: never;
        /** @description Requires the `admin` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdAccountsById"];
        options?: never;
        head?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        patch: operations["patchWorkspacesByWorkspaceIdAccountsById"];
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounts/{id}/reconciliations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAccountsByIdReconciliations"];
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdAccountsByIdReconciliations"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdCategories"];
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdCategories"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/categories/template": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdCategoriesTemplate"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/categories/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdCategoriesById"];
        options?: never;
        head?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        patch: operations["patchWorkspacesByWorkspaceIdCategoriesById"];
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/transactions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdTransactions"];
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdTransactions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/transactions/transfers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdTransactionsTransfers"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/transactions/bulk-categorize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdTransactionsBulkCategorize"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/transactions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdTransactionsById"];
        put?: never;
        post?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdTransactionsById"];
        options?: never;
        head?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        patch: operations["patchWorkspacesByWorkspaceIdTransactionsById"];
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/transactions/{id}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdTransactionsByIdRestore"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/transactions/{id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdTransactionsByIdConfirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/transactions/{id}/splits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        put: operations["putWorkspacesByWorkspaceIdTransactionsByIdSplits"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/transactions/{id}/splits/{splitId}/settle": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdTransactionsByIdSplitsBySplitIdSettle"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/transactions/{id}/comments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdTransactionsByIdComments"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/transactions/{id}/comments/{commentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description Requires the `viewer` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdTransactionsByIdCommentsByCommentId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/tags": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdTags"];
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdTags"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/tags/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdTagsById"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/imports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdImports"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/imports/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdImportsPreview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/imports/{batchId}/commit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdImportsByBatchIdCommit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/imports/{batchId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdImportsByBatchId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/budgets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdBudgets"];
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdBudgets"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/budgets/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdBudgetsById"];
        put?: never;
        post?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdBudgetsById"];
        options?: never;
        head?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        patch: operations["patchWorkspacesByWorkspaceIdBudgetsById"];
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/budgets/{id}/lines": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        put: operations["putWorkspacesByWorkspaceIdBudgetsByIdLines"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/budgets/{id}/lines/{lineId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdBudgetsByIdLinesByLineId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/budgets/{id}/lines/{lineId}/revise": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdBudgetsByIdLinesByLineIdRevise"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/budgets/{id}/rollover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdBudgetsByIdRollover"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/recurring": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdRecurring"];
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdRecurring"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/recurring/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdRecurringById"];
        put?: never;
        post?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdRecurringById"];
        options?: never;
        head?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        patch: operations["patchWorkspacesByWorkspaceIdRecurringById"];
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/recurring/{id}/materialize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdRecurringByIdMaterialize"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/goals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdGoals"];
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdGoals"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/goals/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdGoalsById"];
        put?: never;
        post?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdGoalsById"];
        options?: never;
        head?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        patch: operations["patchWorkspacesByWorkspaceIdGoalsById"];
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/goals/{id}/contributions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdGoalsByIdContributions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/goals/{id}/contributions/{contributionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description Requires the `editor` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdGoalsByIdContributionsByContributionId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/alerts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAlerts"];
        /** @description Requires the `admin` role or higher in the workspace. */
        put: operations["putWorkspacesByWorkspaceIdAlerts"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/alerts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description Requires the `admin` role or higher in the workspace. */
        delete: operations["deleteWorkspacesByWorkspaceIdAlertsById"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/alerts/evaluate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Requires the `admin` role or higher in the workspace. */
        post: operations["postWorkspacesByWorkspaceIdAlertsEvaluate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/analytics/dashboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAnalyticsDashboard"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/analytics/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAnalyticsSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/analytics/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAnalyticsCategories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/analytics/trends": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAnalyticsTrends"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/analytics/net-worth": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAnalyticsNetWorth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/analytics/savings-rate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAnalyticsSavingsRate"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/analytics/budget-variance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAnalyticsBudgetVariance"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/analytics/compare": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAnalyticsCompare"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/analytics/insights": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdAnalyticsInsights"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/reports/statement": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdReportsStatement"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/reports/year-over-year": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdReportsYearOverYear"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/reports/export/transactions.csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdReportsExportTransactionsCsv"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/reports/export/statement.csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Requires the `viewer` role or higher in the workspace. */
        get: operations["getWorkspacesByWorkspaceIdReportsExportStatementCsv"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/openapi.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getOpenapiJson"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Account: {
            id: components["schemas"]["Uuid"];
            name: string;
            /** @enum {string} */
            type: "checking" | "savings" | "credit_card" | "investment" | "cash" | "loan";
            currency: components["schemas"]["CurrencyCode"];
            institution: string | null;
            initialBalance: components["schemas"]["Money"];
            currentBalance: components["schemas"]["Money"];
            /** @description Cleared balance plus anything still pending — what is really committed. A decimal string. */
            availableBalance: components["schemas"]["Money"];
            /** @description Credit-card accounts only; `null` on every other type. */
            creditLimit: components["schemas"]["Money"] | null;
            statementDay: components["schemas"]["Integer"] | null;
            dueDay: components["schemas"]["Integer"] | null;
            color: string | null;
            icon: string | null;
            isArchived: boolean;
            createdAt: components["schemas"]["Timestamp"];
        };
        AccountReconciliation: {
            id: components["schemas"]["Uuid"];
            statementDate: components["schemas"]["DateOnly"];
            statementBalance: components["schemas"]["Money"];
            computedBalance: components["schemas"]["Money"];
            difference: components["schemas"]["Money"];
            /** @enum {string} */
            status: "open" | "completed";
            notes: string | null;
            completedAt: components["schemas"]["Timestamp"] | null;
            createdAt: components["schemas"]["Timestamp"];
        };
        ActivityItem: {
            id: components["schemas"]["Uuid"];
            /** @description A dotted verb, e.g. `account.created`. */
            action: string;
            entityType: string;
            entityId: components["schemas"]["Uuid"] | null;
            summary: string;
            changes: {
                [key: string]: unknown;
            };
            createdAt: components["schemas"]["Timestamp"];
            /** @description Null when the event was raised by a background job rather than a person. */
            actor: {
                id: components["schemas"]["Uuid"];
                fullName: string;
                avatarUrl: string | null;
            } | null;
        };
        AlertRule: {
            id: components["schemas"]["Uuid"];
            /** @enum {string} */
            type: "budget_threshold" | "budget_exceeded" | "large_transaction" | "unusual_spending" | "duplicate_transaction" | "bill_due" | "goal_milestone" | "low_balance";
            isEnabled: boolean;
            /** @description Rule-specific settings; the keys depend on `type`. See `docs/api.md`. */
            config: {
                [key: string]: unknown;
            };
            channels: ("in_app" | "email" | "push")[];
            /** @description Narrows the rule to one category; null means the whole workspace. */
            scopeCategoryId: components["schemas"]["Uuid"] | null;
            scopeAccountId: components["schemas"]["Uuid"] | null;
            createdAt: components["schemas"]["Timestamp"];
            updatedAt: components["schemas"]["Timestamp"];
        };
        BudgetLineProgress: {
            id: components["schemas"]["Uuid"];
            categoryId: components["schemas"]["Uuid"];
            categoryName: string;
            categoryColor: string | null;
            /** @description When true, spending in descendant categories counts against this line. */
            includeSubcategories: boolean;
            limitAmount: components["schemas"]["Money"];
            spentAmount: components["schemas"]["Money"];
            /** @description Negative once the line is overspent. */
            remainingAmount: components["schemas"]["Money"];
            percentUsed: number;
            /** @description Where `warning` starts. */
            alertThresholdPercent: number;
            /**
             * @description Derived from spend against limit; never sent by a caller.
             * @enum {string}
             */
            status: "on_track" | "warning" | "exceeded";
        };
        BudgetProgress: {
            id: components["schemas"]["Uuid"];
            name: string;
            /** @enum {string} */
            period: "monthly" | "quarterly" | "yearly" | "custom";
            startDate: components["schemas"]["DateOnly"];
            endDate: components["schemas"]["DateOnly"];
            currency: components["schemas"]["CurrencyCode"];
            rollover: boolean;
            isActive: boolean;
            totalLimit: components["schemas"]["Money"];
            totalSpent: components["schemas"]["Money"];
            totalRemaining: components["schemas"]["Money"];
            percentUsed: number;
            /** @description How much of the period has elapsed, so a client can show pace against spend. */
            periodProgressPercent: number;
            lines: components["schemas"]["BudgetLineProgress"][];
        };
        Category: {
            id: components["schemas"]["Uuid"];
            parentId: components["schemas"]["Uuid"] | null;
            name: string;
            /** @enum {string} */
            kind: "income" | "expense" | "transfer";
            /** @description 0 for a top-level category, 2 at the deepest the schema allows. */
            depth: components["schemas"]["Integer"];
            color: string | null;
            icon: string | null;
            /** @description Seeded from the default template when the workspace was created. */
            isSystem: boolean;
            isArchived: boolean;
            sortOrder: components["schemas"]["Integer"];
        };
        CategoryBreakdownItem: {
            /** @description Null for the uncategorised bucket. */
            categoryId: components["schemas"]["Uuid"] | null;
            categoryName: string;
            categoryColor: string | null;
            parentId: components["schemas"]["Uuid"] | null;
            total: components["schemas"]["Money"];
            transactionCount: components["schemas"]["Integer"];
            percentOfTotal: number;
        };
        CategoryNode: {
            id: components["schemas"]["Uuid"];
            parentId: components["schemas"]["Uuid"] | null;
            name: string;
            /** @enum {string} */
            kind: "income" | "expense" | "transfer";
            /** @description 0 for a top-level category, 2 at the deepest the schema allows. */
            depth: components["schemas"]["Integer"];
            color: string | null;
            icon: string | null;
            /** @description Seeded from the default template when the workspace was created. */
            isSystem: boolean;
            isArchived: boolean;
            sortOrder: components["schemas"]["Integer"];
            children: components["schemas"]["CategoryNode"][];
        };
        CategoryTemplateNode: {
            name: string;
            namePtBr: string;
            /** @enum {string} */
            kind: "income" | "expense" | "transfer";
            color: string;
            icon?: string;
            children?: components["schemas"]["CategoryTemplateNode"][];
        };
        Currency: {
            code: components["schemas"]["CurrencyCode"];
            name: string;
            symbol: string;
            /** @description The minor unit — 2 for most currencies, 0 for JPY. */
            decimalDigits: components["schemas"]["Integer"];
        };
        /** @description ISO 4217 code, upper case — `BRL`, `USD`. */
        CurrencyCode: string;
        /**
         * Format: date
         * @description A calendar date, `YYYY-MM-DD`. No time, no zone.
         */
        DateOnly: string;
        DateRange: {
            start: components["schemas"]["DateOnly"];
            end: components["schemas"]["DateOnly"];
        };
        Error: {
            error: {
                /**
                 * @description The stable, machine-readable member of the error taxonomy.
                 * @enum {string}
                 */
                code: "bad_request" | "validation_failed" | "unauthorized" | "invalid_credentials" | "token_expired" | "forbidden" | "not_found" | "conflict" | "unprocessable" | "rate_limited" | "internal_error" | "service_unavailable";
                /** @description A sentence for a person, rendered in the locale resolved from the profile or `Accept-Language`. Match on `code`, never on this. */
                message: string;
                /** @description Present on a field-validation failure: one entry per rejected field. */
                details?: {
                    /** @description Dotted path, prefixed by the request part: `body.name`. */
                    path: string;
                    message: string;
                }[];
                /** @description Correlates the response with the server log line; also sent as `x-request-id`. */
                requestId?: string;
            };
        };
        Goal: {
            id: components["schemas"]["Uuid"];
            name: string;
            description: string | null;
            /** @enum {string} */
            category: "emergency_fund" | "vacation" | "car" | "house" | "education" | "retirement" | "investment" | "other";
            targetAmount: components["schemas"]["Money"];
            currentAmount: components["schemas"]["Money"];
            remainingAmount: components["schemas"]["Money"];
            progressPercent: number;
            currency: components["schemas"]["CurrencyCode"];
            targetDate: components["schemas"]["DateOnly"] | null;
            /** @description The account the goal is saved into, when one was named. */
            accountId: components["schemas"]["Uuid"] | null;
            /** @enum {string} */
            status: "active" | "achieved" | "paused" | "cancelled";
            priority: components["schemas"]["Integer"];
            color: string | null;
            achievedAt: components["schemas"]["Timestamp"] | null;
            /** @description What it now takes each month to hit the target by `targetDate`. Null without a deadline. */
            requiredMonthlyContribution: components["schemas"]["Money"] | null;
            daysRemaining: components["schemas"]["Integer"] | null;
            /** @description True when the goal is behind the pace its deadline implies. */
            offTrack: boolean;
            createdAt: components["schemas"]["Timestamp"];
        };
        GoalContribution: {
            id: components["schemas"]["Uuid"];
            amount: components["schemas"]["Money"];
            occurredOn: components["schemas"]["DateOnly"];
            note: string | null;
            /** @description Set when the contribution was recorded against a ledger row. */
            transactionId: components["schemas"]["Uuid"] | null;
            createdByName: string | null;
            createdAt: components["schemas"]["Timestamp"];
        };
        ImportBatch: {
            id: components["schemas"]["Uuid"];
            accountId: components["schemas"]["Uuid"];
            accountName: string;
            /** @enum {string} */
            status: "preview" | "committed" | "reverted";
            filename: string | null;
            rowCount: components["schemas"]["Integer"];
            importedCount: components["schemas"]["Integer"];
            createdBy: components["schemas"]["Uuid"] | null;
            createdByName: string | null;
            createdAt: components["schemas"]["Timestamp"];
            committedAt: components["schemas"]["Timestamp"] | null;
            revertedAt: components["schemas"]["Timestamp"] | null;
        };
        /** @description Field name to zero-based column index. An absent key is an unmapped field. */
        ImportColumnMapping: {
            date?: components["schemas"]["Integer"];
            description?: components["schemas"]["Integer"];
            amount?: components["schemas"]["Integer"];
            debit?: components["schemas"]["Integer"];
            credit?: components["schemas"]["Integer"];
            direction?: components["schemas"]["Integer"];
            merchant?: components["schemas"]["Integer"];
            notes?: components["schemas"]["Integer"];
            category?: components["schemas"]["Integer"];
            externalId?: components["schemas"]["Integer"];
        };
        /** @description How the file was read, echoed back so nothing about the parse is implicit. */
        ImportOptions: {
            /** @enum {string} */
            delimiter: "," | ";" | "\t" | "|";
            hasHeader: boolean;
            mapping: components["schemas"]["ImportColumnMapping"];
            /**
             * @description `dmy` and `mdy` are the two readings of `01/02/2026`.
             * @enum {string}
             */
            dateFormat: "iso" | "dmy" | "mdy";
            /** @enum {string} */
            decimalSeparator: "." | ",";
            /**
             * @description One signed column, separate debit/credit columns, or a magnitude plus a D/C flag.
             * @enum {string}
             */
            signConvention: "signed" | "debit_credit" | "direction_flag";
            invertAmounts: boolean;
        };
        ImportPreview: {
            /** @description The preview id and the batch id are the same thing; commit takes it. */
            batchId: components["schemas"]["Uuid"];
            accountId: components["schemas"]["Uuid"];
            accountName: string;
            currency: components["schemas"]["CurrencyCode"];
            filename: string | null;
            headers: string[];
            options: components["schemas"]["ImportOptions"];
            /** @description The mapping came from this account's last import rather than a guess. */
            mappingRecalled: boolean;
            /** @description The file reads either way round and nothing in it settles it. Ask before committing. */
            dateFormatAmbiguous: boolean;
            rows: components["schemas"]["ImportPreviewRow"][];
            counts: {
                total: components["schemas"]["Integer"];
                ready: components["schemas"]["Integer"];
                invalid: components["schemas"]["Integer"];
                duplicate: components["schemas"]["Integer"];
            };
            totals: {
                inflow: components["schemas"]["Money"];
                outflow: components["schemas"]["Money"];
                net: components["schemas"]["Money"];
            };
            /** @description Abandoned previews are swept hourly. */
            expiresAt: components["schemas"]["Timestamp"];
        };
        ImportPreviewRow: {
            /** @description 1-based line in the source file, header included, so it matches a text editor. */
            lineNumber: components["schemas"]["Integer"];
            occurredOn: components["schemas"]["DateOnly"] | null;
            description: string;
            merchant: string | null;
            notes: string | null;
            /** @description Signed, in the account's currency: negative is money leaving. */
            amount: components["schemas"]["Money"] | null;
            type: ("income" | "expense") | null;
            categoryId: components["schemas"]["Uuid"] | null;
            /** @description The file's own category text when it matched nothing here. */
            categoryName: string | null;
            externalId: string | null;
            errors: components["schemas"]["ImportRowIssue"][];
            /** @description An existing ledger row this looks like. */
            duplicateOfTransactionId: components["schemas"]["Uuid"] | null;
            /** @description An earlier row of this same file this looks like. */
            duplicateOfLineNumber: components["schemas"]["Integer"] | null;
            /** @description The unparsed fields, so the client can show what it read. */
            raw: string[];
        };
        ImportRowIssue: {
            field: string;
            /** @description Already rendered in the request's locale. */
            message: string;
        };
        Integer: number;
        /** @description A decimal amount as a string, never a JSON number. Stored as NUMERIC(19,4). */
        Money: string;
        Notification: {
            id: components["schemas"]["Uuid"];
            /** @description Null for a notice about the account rather than about a workspace. */
            workspaceId: components["schemas"]["Uuid"] | null;
            /** @description The alert rule type that raised it, or a system event name. */
            type: string;
            /** @enum {string} */
            severity: "info" | "warning" | "critical";
            /** @description Already rendered in the recipient's language. */
            title: string;
            /** @description Already rendered in the recipient's language. */
            message: string;
            /** @description Whatever the rule attached — amounts, ids — for a client to link from. */
            data: {
                [key: string]: unknown;
            };
            readAt: components["schemas"]["Timestamp"] | null;
            createdAt: components["schemas"]["Timestamp"];
        };
        PeriodTotals: {
            income: components["schemas"]["Money"];
            /** @description Positive: the magnitude spent, not the signed ledger total. */
            expenses: components["schemas"]["Money"];
            net: components["schemas"]["Money"];
            /** @description Net as a percentage of income. 0 when there was no income. */
            savingsRate: number;
        };
        ReconciliationResult: {
            id: components["schemas"]["Uuid"];
            statementDate: components["schemas"]["DateOnly"];
            statementBalance: components["schemas"]["Money"];
            computedBalance: components["schemas"]["Money"];
            difference: components["schemas"]["Money"];
            /**
             * @description `completed` only when the two balances matched exactly.
             * @enum {string}
             */
            status: "open" | "completed";
            transactionsMarked: components["schemas"]["Integer"];
        };
        RecurringTransaction: {
            id: components["schemas"]["Uuid"];
            name: string;
            accountId: components["schemas"]["Uuid"];
            /** @description Joined by the list and detail queries only. */
            accountName?: string;
            categoryId: components["schemas"]["Uuid"] | null;
            /** @description Joined by the list and detail queries only. */
            categoryName?: string | null;
            /** @enum {string} */
            type: "income" | "expense";
            /** @description Signed as stored — negative for an expense — unlike the create/update input. */
            amount: components["schemas"]["Money"];
            currency: components["schemas"]["CurrencyCode"];
            description: string;
            merchant: string | null;
            /** @enum {string} */
            frequency: "daily" | "weekly" | "monthly" | "yearly" | "custom";
            /** @description Every N periods. 1 unless `frequency` is `custom`. */
            intervalCount: components["schemas"]["Integer"];
            /** @description 0–6, Sunday first. Weekly schedules only. */
            byWeekday: components["schemas"]["Integer"][] | null;
            dayOfMonth: components["schemas"]["Integer"] | null;
            monthOfYear: components["schemas"]["Integer"] | null;
            startDate: components["schemas"]["DateOnly"];
            endDate: components["schemas"]["DateOnly"] | null;
            occurrenceLimit: components["schemas"]["Integer"] | null;
            occurrencesCreated: components["schemas"]["Integer"];
            /** @description Null once the schedule is finished or inactive. */
            nextOccurrenceOn: components["schemas"]["DateOnly"] | null;
            /** @description True posts generated rows as `cleared`; false leaves them `scheduled` for confirmation. */
            autoPost: boolean;
            /** @description How far ahead of the due date a row is generated. */
            leadTimeDays: components["schemas"]["Integer"];
            isActive: boolean;
            /** @description The schedule in words, e.g. "Monthly on the 1st". Already translated. */
            summary: string;
        };
        Tag: {
            id: components["schemas"]["Uuid"];
            name: string;
            color: string | null;
            /** @description How many transactions carry the tag. Listing only. */
            usageCount?: components["schemas"]["Integer"];
        };
        /**
         * Format: date-time
         * @description An instant in UTC, ISO 8601: `2026-08-14T12:00:00.000Z`.
         */
        Timestamp: string;
        Transaction: {
            id: components["schemas"]["Uuid"];
            accountId: components["schemas"]["Uuid"];
            /** @description Joined by the list and detail queries only. */
            accountName?: string;
            categoryId: components["schemas"]["Uuid"] | null;
            categoryName?: string | null;
            /** @enum {string} */
            type: "income" | "expense" | "transfer";
            /** @enum {string} */
            status: "cleared" | "pending" | "scheduled" | "void";
            /** @description Signed as stored: negative for an expense, positive for income. */
            amount: components["schemas"]["Money"];
            currency: components["schemas"]["CurrencyCode"];
            /** @description The same amount in the workspace's base currency, converted on the day it happened. */
            baseAmount: components["schemas"]["Money"];
            /** @description The rate that applied on `occurredOn`, to ten decimal places. */
            exchangeRate: components["schemas"]["Money"];
            description: string;
            merchant: string | null;
            notes: string | null;
            occurredOn: components["schemas"]["DateOnly"];
            /** @description Both legs of a transfer share one group id. */
            transferGroupId: components["schemas"]["Uuid"] | null;
            counterAccountId: components["schemas"]["Uuid"] | null;
            recurringTransactionId: components["schemas"]["Uuid"] | null;
            isReconciled: boolean;
            paidByUserId: components["schemas"]["Uuid"] | null;
            createdBy: components["schemas"]["Uuid"] | null;
            createdByName?: string | null;
            /** @description Tag names, attached by the list and detail queries only. */
            tags?: string[];
            createdAt: components["schemas"]["Timestamp"];
            updatedAt: components["schemas"]["Timestamp"];
            /** @description Set on a soft-deleted row. Only `?includeDeleted=true` returns one; `POST /:id/restore` undoes it. */
            deletedAt: components["schemas"]["Timestamp"] | null;
        };
        TransactionComment: {
            id: components["schemas"]["Uuid"];
            body: string;
            userId: components["schemas"]["Uuid"];
            fullName: string;
            avatarUrl: string | null;
            createdAt: components["schemas"]["Timestamp"];
            updatedAt: components["schemas"]["Timestamp"];
        };
        TransactionSplit: {
            id: components["schemas"]["Uuid"];
            userId: components["schemas"]["Uuid"];
            fullName: string;
            shareAmount: components["schemas"]["Money"];
            /** @description Present when the split was made by weight. */
            sharePercent: components["schemas"]["Money"] | null;
            settledAt: components["schemas"]["Timestamp"] | null;
            note: string | null;
        };
        TrendPoint: {
            /** @description The bucket label: `2026`, `2026-03` or `2026-03-14`, following `unit`. */
            period: string;
            periodStart: components["schemas"]["DateOnly"];
            income: components["schemas"]["Money"];
            expenses: components["schemas"]["Money"];
            net: components["schemas"]["Money"];
        };
        User: {
            id: components["schemas"]["Uuid"];
            email: string;
            fullName: string;
            /** @description A BCP 47 tag. The API answers in it when `Accept-Language` says nothing. */
            locale: string;
            /** @description An IANA zone, e.g. `America/Sao_Paulo`. */
            timezone: string;
            baseCurrency: components["schemas"]["CurrencyCode"];
            avatarUrl: string | null;
        };
        /** Format: uuid */
        Uuid: string;
        Workspace: {
            id: components["schemas"]["Uuid"];
            name: string;
            /** @enum {string} */
            type: "personal" | "shared";
            ownerId: components["schemas"]["Uuid"];
            /** @description Every analytic figure in this workspace is expressed in it. */
            baseCurrency: components["schemas"]["CurrencyCode"];
            timezone: string;
            /**
             * @description The calling user's role here, not a property of the workspace.
             * @enum {string}
             */
            role: "owner" | "admin" | "editor" | "viewer";
            memberCount: components["schemas"]["Integer"];
            settings: {
                [key: string]: unknown;
            };
            createdAt: components["schemas"]["Timestamp"];
            archivedAt: components["schemas"]["Timestamp"] | null;
        };
        WorkspaceInvitation: {
            id: components["schemas"]["Uuid"];
            email: string;
            /**
             * @description Ownership moves through its own endpoint, so it cannot be invited to.
             * @enum {string}
             */
            role: "admin" | "editor" | "viewer";
            /** @description `pending`, `accepted`, `revoked` or `expired`. */
            status: string;
            invitedByName: string | null;
            expiresAt: components["schemas"]["Timestamp"];
            createdAt: components["schemas"]["Timestamp"];
        };
        WorkspaceMember: {
            /** @description The membership row, not the user. */
            id: components["schemas"]["Uuid"];
            userId: components["schemas"]["Uuid"];
            email: string;
            fullName: string;
            avatarUrl: string | null;
            /** @enum {string} */
            role: "owner" | "admin" | "editor" | "viewer";
            joinedAt: components["schemas"]["Timestamp"];
        };
    };
    responses: {
        /** @description The request was malformed — unparseable JSON, or a value the database refused outright. */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description No bearer token was sent, or it has expired or belongs to an inactive account. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The caller is authenticated but lacks the required role in this workspace. */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description No such resource, or none the caller is allowed to know exists. */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The write collided with an existing row, such as a duplicate name. */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description One or more fields were rejected. `error.details` names each one, already translated into the language resolved for the request. */
        ValidationFailed: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Too many requests; the caller has exceeded the rate limit for this window. */
        RateLimited: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Something failed inside the API. The message is fixed and the detail stays in the logs. */
        InternalError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Liveness. Deliberately dependency-free, so a database blip cannot get a healthy container restarted. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        status: "ok";
                        /** @description Seconds since this process started. */
                        uptime: number;
                        /** @enum {string} */
                        env: "development" | "test" | "production";
                    };
                };
            };
            500: components["responses"]["InternalError"];
        };
    };
    getHealthReady: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Readiness: whether this instance can actually serve traffic. Answers 503 when it cannot. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "ready" | "degraded";
                        /** @enum {string} */
                        database: "ok" | "down";
                        /** @enum {string} */
                        redis: "ok" | "down";
                    };
                };
            };
            500: components["responses"]["InternalError"];
            /** @description Readiness: whether this instance can actually serve traffic. Answers 503 when it cannot. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "ready" | "degraded";
                        /** @enum {string} */
                        database: "ok" | "down";
                        /** @enum {string} */
                        redis: "ok" | "down";
                    };
                };
            };
        };
    };
    postAuthRegister: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    /** @description Must contain at least one letter and at least one digit. */
                    password: string;
                    fullName: string;
                    locale?: string;
                    timezone?: string;
                    baseCurrency?: string;
                    workspaceName?: string;
                };
            };
        };
        responses: {
            /** @description A signed-in session. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        user: components["schemas"]["User"];
                        /** @description A short-lived JWT. Send it as `Authorization: Bearer …`. */
                        accessToken: string;
                        /** @description Opaque and single-use. Also set as an HttpOnly cookie. */
                        refreshToken: string;
                        /** @description Seconds until the access token expires. */
                        expiresIn: components["schemas"]["Integer"];
                        /** @description The workspace created with the account, on register only. */
                        defaultWorkspaceId?: components["schemas"]["Uuid"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postAuthLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    password: string;
                };
            };
        };
        responses: {
            /** @description A signed-in session. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        user: components["schemas"]["User"];
                        /** @description A short-lived JWT. Send it as `Authorization: Bearer …`. */
                        accessToken: string;
                        /** @description Opaque and single-use. Also set as an HttpOnly cookie. */
                        refreshToken: string;
                        /** @description Seconds until the access token expires. */
                        expiresIn: components["schemas"]["Integer"];
                        /** @description The workspace created with the account, on register only. */
                        defaultWorkspaceId?: components["schemas"]["Uuid"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postAuthRefresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    refreshToken?: string;
                };
            };
        };
        responses: {
            /** @description A rotated pair. The presented refresh token is dead from this point on. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        accessToken: string;
                        refreshToken: string;
                        expiresIn: components["schemas"]["Integer"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postAuthLogout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    refreshToken?: string;
                };
            };
        };
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postAuthLogoutAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postAuthChangePassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    currentPassword: string;
                    /** @description Must contain at least one letter and at least one digit. */
                    newPassword: string;
                };
            };
        };
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getAuthMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        user: components["schemas"]["User"];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteUsersMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @constant */
                    confirm: true;
                    currentPassword: string;
                };
            };
        };
        responses: {
            /** @description An erasure that has been scheduled, not performed. Every session is revoked immediately; the data is removed once the grace period elapses. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description When the erasure will actually happen. Signing in before then cancels it. */
                        deletionScheduledFor: components["schemas"]["Timestamp"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    patchUsersMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    fullName?: string;
                    avatarUrl?: string | null;
                    locale?: string;
                    timezone?: string;
                    baseCurrency?: string;
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        user: components["schemas"]["User"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getUsersMeExport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Every row tied to this account, as a downloadable file. The shape follows the database rather than the API, so it is deliberately not modelled here. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": string;
                };
            };
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getCurrencies: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        currencies: components["schemas"]["Currency"][];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getCurrenciesRate: {
        parameters: {
            query: {
                from: string;
                to: string;
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                asOf?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The rate in force on `asOf`, which is the rate a transaction on that day was converted at. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        from: components["schemas"]["CurrencyCode"];
                        to: components["schemas"]["CurrencyCode"];
                        asOf: components["schemas"]["DateOnly"];
                        /** @description Ten decimal places. Multiply an amount in `from` by this to get `to`. Exactly "1" when they match. */
                        rate: components["schemas"]["Money"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getNotifications: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                /** @description A boolean written into a query string. `true`, `1` and `yes` are true; anything else listed is false. */
                unreadOnly?: boolean | ("0" | "1" | "true" | "false" | "yes" | "no");
                workspaceId?: string;
                type?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One page of the inbox, newest first. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["Notification"][];
                        page: components["schemas"]["Integer"];
                        pageSize: components["schemas"]["Integer"];
                        total: components["schemas"]["Integer"];
                        totalPages: components["schemas"]["Integer"];
                        hasMore: boolean;
                        /** @description Across the whole inbox, not just this page. */
                        unreadCount: components["schemas"]["Integer"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postNotificationsByIdRead: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postNotificationsReadAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    workspaceId?: string;
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        updated: components["schemas"]["Integer"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteNotificationsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postInvitationsAccept: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    token: string;
                };
            };
        };
        responses: {
            /** @description Where the caller has just been admitted, so a client can navigate straight there. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        workspaceId: components["schemas"]["Uuid"];
                        workspaceName: string;
                        /** @enum {string} */
                        role: "owner" | "admin" | "editor" | "viewer";
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspaces: {
        parameters: {
            query?: {
                /** @description A boolean written into a query string. `true`, `1` and `yes` are true; anything else listed is false. */
                includeArchived?: boolean | ("0" | "1" | "true" | "false" | "yes" | "no");
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        workspaces: components["schemas"]["Workspace"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspaces: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /**
                     * @default personal
                     * @enum {string}
                     */
                    type?: "personal" | "shared";
                    baseCurrency?: string;
                    timezone?: string;
                    seedCategories?: boolean;
                };
            };
        };
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        workspace: components["schemas"]["Workspace"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        workspace: components["schemas"]["Workspace"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    patchWorkspacesByWorkspaceId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    baseCurrency?: string;
                    timezone?: string;
                    settings?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        workspace: components["schemas"]["Workspace"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdMembers: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        members: components["schemas"]["WorkspaceMember"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdMembersByUserId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                userId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    patchWorkspacesByWorkspaceIdMembersByUserId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                userId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    role: "admin" | "editor" | "viewer";
                };
            };
        };
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdTransferOwnership: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    newOwnerId: string;
                };
            };
        };
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdInvitations: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        invitations: components["schemas"]["WorkspaceInvitation"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdInvitations: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    /**
                     * @default editor
                     * @enum {string}
                     */
                    role?: "admin" | "editor" | "viewer";
                };
            };
        };
        responses: {
            /** @description The seat is reserved and the email is on its way. The token is not returned. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        invitation: components["schemas"]["WorkspaceInvitation"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdInvitationsByInvitationId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                invitationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdActivity: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                entityType?: string;
                entityId?: string;
                actorUserId?: string;
                /** @description A boolean written into a query string. `true`, `1` and `yes` are true; anything else listed is false. */
                includeAudit?: boolean | ("0" | "1" | "true" | "false" | "yes" | "no");
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The collaboration feed. Audit-only events are included for an admin who asks for them, and for nobody else. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["ActivityItem"][];
                        page: components["schemas"]["Integer"];
                        pageSize: components["schemas"]["Integer"];
                        total: components["schemas"]["Integer"];
                        totalPages: components["schemas"]["Integer"];
                        hasMore: boolean;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAccounts: {
        parameters: {
            query?: {
                /** @description A boolean written into a query string. `true`, `1` and `yes` are true; anything else listed is false. */
                includeArchived?: boolean | ("0" | "1" | "true" | "false" | "yes" | "no");
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The workspace's accounts, with the total held in each currency and the converted total. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        accounts: components["schemas"]["Account"][];
                        /** @description Every account converted into the workspace's base currency at today's rate, then summed. */
                        totalBalance: components["schemas"]["Money"];
                        balanceByCurrency: {
                            [key: string]: components["schemas"]["Money"];
                        };
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdAccounts: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @enum {string} */
                    type: "checking" | "savings" | "credit_card" | "investment" | "cash" | "loan";
                    currency: string;
                    institution?: string | null;
                    /** @description A decimal amount with at most 15 integer digits and 4 decimal places, matching the `NUMERIC(19,4)` column it is stored in. Send it as a string: a JSON number is accepted for convenience but loses precision on the way in. */
                    initialBalance?: string | number;
                    creditLimit?: (string | number) | null;
                    statementDay?: number | null;
                    dueDay?: number | null;
                    color?: string | null;
                    icon?: string | null;
                };
            };
        };
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        account: components["schemas"]["Account"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAccountsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        account: components["schemas"]["Account"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdAccountsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    patchWorkspacesByWorkspaceIdAccountsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    institution?: string | null;
                    /** @description A decimal amount with at most 15 integer digits and 4 decimal places, matching the `NUMERIC(19,4)` column it is stored in. Send it as a string: a JSON number is accepted for convenience but loses precision on the way in. */
                    initialBalance?: string | number;
                    creditLimit?: (string | number) | null;
                    statementDay?: number | null;
                    dueDay?: number | null;
                    color?: string | null;
                    icon?: string | null;
                    isArchived?: boolean;
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        account: components["schemas"]["Account"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAccountsByIdReconciliations: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        reconciliations: components["schemas"]["AccountReconciliation"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdAccountsByIdReconciliations: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                    statementDate: string;
                    /** @description A decimal amount with at most 15 integer digits and 4 decimal places, matching the `NUMERIC(19,4)` column it is stored in. Send it as a string: a JSON number is accepted for convenience but loses precision on the way in. */
                    statementBalance: string | number;
                    notes?: string | null;
                    markTransactions?: boolean;
                };
            };
        };
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        reconciliation: components["schemas"]["ReconciliationResult"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdCategories: {
        parameters: {
            query?: {
                /** @description A boolean written into a query string. `true`, `1` and `yes` are true; anything else listed is false. */
                includeArchived?: boolean | ("0" | "1" | "true" | "false" | "yes" | "no");
                kind?: "income" | "expense" | "transfer";
                shape?: "tree" | "flat";
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Nested when `shape=tree`, which is the default; flat rows carrying `depth` when `shape=flat`. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        categories: components["schemas"]["CategoryNode"][];
                    } | {
                        categories: components["schemas"]["Category"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdCategories: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    parentId?: string | null;
                    /** @enum {string} */
                    kind?: "income" | "expense" | "transfer";
                    color?: string | null;
                    icon?: string | null;
                    sortOrder?: number;
                };
            };
        };
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        category: components["schemas"]["Category"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdCategoriesTemplate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        template: components["schemas"]["CategoryTemplateNode"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdCategoriesById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    patchWorkspacesByWorkspaceIdCategoriesById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    parentId?: string | null;
                    color?: string | null;
                    icon?: string | null;
                    sortOrder?: number;
                    isArchived?: boolean;
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        category: components["schemas"]["Category"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdTransactions: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                /** @description UUIDs, either comma-separated in one parameter or repeated across several. Every entry must be a UUID. */
                accountIds?: string | string[];
                /** @description UUIDs, either comma-separated in one parameter or repeated across several. Every entry must be a UUID. */
                categoryIds?: string | string[];
                /** @description UUIDs, either comma-separated in one parameter or repeated across several. Every entry must be a UUID. */
                tagIds?: string | string[];
                /** @description A boolean written into a query string. `true`, `1` and `yes` are true; anything else listed is false. */
                includeSubcategories?: boolean | ("0" | "1" | "true" | "false" | "yes" | "no");
                types?: string | string[];
                statuses?: string | string[];
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                from?: string;
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                to?: string;
                /** @description A decimal amount with at most 15 integer digits and 4 decimal places, matching the `NUMERIC(19,4)` column it is stored in. Send it as a string: a JSON number is accepted for convenience but loses precision on the way in. */
                minAmount?: string | number;
                /** @description A decimal amount with at most 15 integer digits and 4 decimal places, matching the `NUMERIC(19,4)` column it is stored in. Send it as a string: a JSON number is accepted for convenience but loses precision on the way in. */
                maxAmount?: string | number;
                search?: string;
                createdBy?: string;
                /** @description A boolean written into a query string. `true`, `1` and `yes` are true; anything else listed is false. */
                isReconciled?: boolean | ("0" | "1" | "true" | "false" | "yes" | "no");
                /** @description A boolean written into a query string. `true`, `1` and `yes` are true; anything else listed is false. */
                includeDeleted?: boolean | ("0" | "1" | "true" | "false" | "yes" | "no");
                sortBy?: "occurredOn" | "amount" | "createdAt";
                sortDirection?: "asc" | "desc";
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One page of the ledger, newest first unless `sortBy` says otherwise. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["Transaction"][];
                        page: components["schemas"]["Integer"];
                        pageSize: components["schemas"]["Integer"];
                        total: components["schemas"]["Integer"];
                        totalPages: components["schemas"]["Integer"];
                        hasMore: boolean;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdTransactions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    accountId: string;
                    categoryId?: string | null;
                    /** @enum {string} */
                    type: "income" | "expense";
                    /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                    amount: string | number;
                    description: string;
                    merchant?: string | null;
                    notes?: string | null;
                    /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                    occurredOn: string;
                    /** @enum {string} */
                    status?: "cleared" | "pending" | "scheduled";
                    paidByUserId?: string | null;
                    tagIds?: string[];
                };
            };
        };
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        transaction: components["schemas"]["Transaction"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdTransactionsTransfers: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    fromAccountId: string;
                    /** Format: uuid */
                    toAccountId: string;
                    /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                    amount: string | number;
                    /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                    destinationAmount?: string | number;
                    description: string;
                    notes?: string | null;
                    /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                    occurredOn: string;
                    /** @enum {string} */
                    status?: "cleared" | "pending";
                };
            };
        };
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        transactions: components["schemas"]["Transaction"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdTransactionsBulkCategorize: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    transactionIds: string[];
                    categoryId: string | null;
                };
            };
        };
        responses: {
            /** @description How many rows the recategorisation actually changed. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        updated: components["schemas"]["Integer"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdTransactionsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The row, its splits and its comment thread, in one call. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        transaction: components["schemas"]["Transaction"];
                        splits: components["schemas"]["TransactionSplit"][];
                        comments: components["schemas"]["TransactionComment"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdTransactionsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    patchWorkspacesByWorkspaceIdTransactionsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    accountId?: string;
                    categoryId?: string | null;
                    /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                    amount?: string | number;
                    description?: string;
                    merchant?: string | null;
                    notes?: string | null;
                    /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                    occurredOn?: string;
                    /** @enum {string} */
                    status?: "cleared" | "pending" | "scheduled" | "void";
                    paidByUserId?: string | null;
                    tagIds?: string[];
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        transaction: components["schemas"]["Transaction"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdTransactionsByIdRestore: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdTransactionsByIdConfirm: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    putWorkspacesByWorkspaceIdTransactionsByIdSplits: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    splits: {
                        /** Format: uuid */
                        userId: string;
                        /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                        shareAmount?: string | number;
                        /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                        weight?: string | number;
                        note?: string | null;
                    }[];
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        splits: components["schemas"]["TransactionSplit"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdTransactionsByIdSplitsBySplitIdSettle: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
                splitId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default true */
                    settled?: boolean;
                };
            };
        };
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdTransactionsByIdComments: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    body: string;
                };
            };
        };
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        comment: components["schemas"]["TransactionComment"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdTransactionsByIdCommentsByCommentId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
                commentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdTags: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        tags: components["schemas"]["Tag"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdTags: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    color?: string | null;
                };
            };
        };
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        tag: components["schemas"]["Tag"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdTagsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdImports: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        batches: components["schemas"]["ImportBatch"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdImportsPreview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    delimiter?: "," | ";" | "\t" | "|";
                    hasHeader?: boolean;
                    mapping?: {
                        date?: number;
                        description?: number;
                        amount?: number;
                        debit?: number;
                        credit?: number;
                        direction?: number;
                        merchant?: number;
                        notes?: number;
                        category?: number;
                        externalId?: number;
                    };
                    /** @enum {string} */
                    dateFormat?: "iso" | "dmy" | "mdy";
                    /** @enum {string} */
                    decimalSeparator?: "." | ",";
                    /** @enum {string} */
                    signConvention?: "signed" | "debit_credit" | "direction_flag";
                    invertAmounts?: boolean;
                    /** Format: uuid */
                    accountId: string;
                    filename?: string | null;
                    content: string;
                };
            };
        };
        responses: {
            /** @description The whole file parsed and checked. Nothing has been written to the ledger. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        preview: components["schemas"]["ImportPreview"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdImportsByBatchIdCommit: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                batchId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    rows: {
                        lineNumber: number;
                        categoryId?: string | null;
                    }[];
                };
            };
        };
        responses: {
            /** @description Every kept row was inserted, or none was. Keep `batchId` — it is what undo takes. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        batchId: components["schemas"]["Uuid"];
                        imported: components["schemas"]["Integer"];
                        accountId: components["schemas"]["Uuid"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdImportsByBatchId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                batchId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description How many rows the undo removed from the ledger. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        reverted: components["schemas"]["Integer"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdBudgets: {
        parameters: {
            query?: {
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                activeOn?: string;
                /** @description A boolean written into a query string. `true`, `1` and `yes` are true; anything else listed is false. */
                includeInactive?: boolean | ("0" | "1" | "true" | "false" | "yes" | "no");
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        budgets: components["schemas"]["BudgetProgress"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdBudgets: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @enum {string} */
                    period: "monthly" | "quarterly" | "yearly" | "custom";
                    /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                    startDate: string;
                    /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                    endDate?: string;
                    currency?: string;
                    rollover?: boolean;
                    lines: {
                        /** Format: uuid */
                        categoryId: string;
                        /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                        limitAmount: string | number;
                        includeSubcategories?: boolean;
                        alertThresholdPercent?: number;
                    }[];
                };
            };
        };
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        budget: components["schemas"]["BudgetProgress"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdBudgetsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        budget: components["schemas"]["BudgetProgress"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdBudgetsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    patchWorkspacesByWorkspaceIdBudgetsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    isActive?: boolean;
                    rollover?: boolean;
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        budget: components["schemas"]["BudgetProgress"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    putWorkspacesByWorkspaceIdBudgetsByIdLines: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    categoryId: string;
                    /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                    limitAmount: string | number;
                    includeSubcategories?: boolean;
                    alertThresholdPercent?: number;
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        budget: components["schemas"]["BudgetProgress"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdBudgetsByIdLinesByLineId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
                lineId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdBudgetsByIdLinesByLineIdRevise: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
                lineId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                    newLimit: string | number;
                    reason?: string | null;
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        budget: components["schemas"]["BudgetProgress"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdBudgetsByIdRollover: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        budget: components["schemas"]["BudgetProgress"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdRecurring: {
        parameters: {
            query?: {
                /** @description A boolean written into a query string. `true`, `1` and `yes` are true; anything else listed is false. */
                includeInactive?: boolean | ("0" | "1" | "true" | "false" | "yes" | "no");
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        recurring: components["schemas"]["RecurringTransaction"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdRecurring: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    accountId: string;
                    categoryId?: string | null;
                    name: string;
                    /** @enum {string} */
                    type: "income" | "expense";
                    /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                    amount: string | number;
                    description: string;
                    merchant?: string | null;
                    notes?: string | null;
                    /** @enum {string} */
                    frequency: "daily" | "weekly" | "monthly" | "yearly" | "custom";
                    intervalCount?: number;
                    byWeekday?: number[] | null;
                    dayOfMonth?: number | null;
                    monthOfYear?: number | null;
                    /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                    startDate: string;
                    endDate?: string | null;
                    occurrenceLimit?: number | null;
                    autoPost?: boolean;
                    leadTimeDays?: number;
                };
            };
        };
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        recurring: components["schemas"]["RecurringTransaction"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdRecurringById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The schedule and a preview of where it goes next. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        recurring: components["schemas"]["RecurringTransaction"];
                        /** @description The next twelve dates the schedule would fire on. */
                        upcoming: components["schemas"]["DateOnly"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdRecurringById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    patchWorkspacesByWorkspaceIdRecurringById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                    amount?: string | number;
                    description?: string;
                    merchant?: string | null;
                    categoryId?: string | null;
                    endDate?: string | null;
                    isActive?: boolean;
                    autoPost?: boolean;
                    leadTimeDays?: number;
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        recurring: components["schemas"]["RecurringTransaction"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdRecurringByIdMaterialize: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                    through?: string;
                };
            };
        };
        responses: {
            /** @description Generation is idempotent: an occurrence that already produced a transaction is skipped. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        scheduleId: components["schemas"]["Uuid"];
                        created: components["schemas"]["Integer"];
                        nextOccurrenceOn: components["schemas"]["DateOnly"] | null;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdGoals: {
        parameters: {
            query?: {
                status?: "active" | "achieved" | "paused" | "cancelled";
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        goals: components["schemas"]["Goal"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdGoals: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    description?: string | null;
                    /** @enum {string} */
                    category?: "emergency_fund" | "vacation" | "car" | "house" | "education" | "retirement" | "investment" | "other";
                    /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                    targetAmount: string | number;
                    currency?: string;
                    targetDate?: string | null;
                    accountId?: string | null;
                    priority?: number;
                    color?: string | null;
                };
            };
        };
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        goal: components["schemas"]["Goal"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdGoalsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The goal and its contribution history, newest first. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        goal: components["schemas"]["Goal"];
                        contributions: components["schemas"]["GoalContribution"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdGoalsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    patchWorkspacesByWorkspaceIdGoalsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    description?: string | null;
                    /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                    targetAmount?: string | number;
                    targetDate?: string | null;
                    /** @enum {string} */
                    status?: "active" | "achieved" | "paused" | "cancelled";
                    priority?: number;
                    color?: string | null;
                    accountId?: string | null;
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        goal: components["schemas"]["Goal"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdGoalsByIdContributions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description A decimal amount greater than zero. "Greater than zero" cannot be expressed against a decimal held as a string, so it is stated here rather than published as a constraint. */
                    amount: string | number;
                    /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                    occurredOn?: string;
                    transactionId?: string | null;
                    note?: string | null;
                };
            };
        };
        responses: {
            /** @description Created. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        goal: components["schemas"]["Goal"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdGoalsByIdContributionsByContributionId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
                contributionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAlerts: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        rules: components["schemas"]["AlertRule"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    putWorkspacesByWorkspaceIdAlerts: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    type: "budget_threshold" | "budget_exceeded" | "large_transaction" | "unusual_spending" | "duplicate_transaction" | "bill_due" | "goal_milestone" | "low_balance";
                    isEnabled?: boolean;
                    config?: {
                        [key: string]: unknown;
                    };
                    channels?: ("in_app" | "email" | "push")[];
                    scopeCategoryId?: string | null;
                    scopeAccountId?: string | null;
                };
            };
        };
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        rule: components["schemas"]["AlertRule"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteWorkspacesByWorkspaceIdAlertsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description No content. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    postWorkspacesByWorkspaceIdAlertsEvaluate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One scan across the enabled rules. A rule that throws is logged and skipped rather than stopping the rest, so a partial count is a real outcome. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        workspaceId: components["schemas"]["Uuid"];
                        notificationsCreated: components["schemas"]["Integer"];
                        /** @description Keyed by alert rule type. */
                        byType: {
                            [key: string]: components["schemas"]["Integer"];
                        };
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAnalyticsDashboard: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Everything the main dashboard needs, in one round trip. Cached briefly in Redis. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        asOf: components["schemas"]["DateOnly"];
                        baseCurrency: components["schemas"]["CurrencyCode"];
                        totalBalance: components["schemas"]["Money"];
                        balanceByCurrency: {
                            [key: string]: components["schemas"]["Money"];
                        };
                        accounts: components["schemas"]["Account"][];
                        month: {
                            income: components["schemas"]["Money"];
                            /** @description Positive: the magnitude spent, not the signed ledger total. */
                            expenses: components["schemas"]["Money"];
                            net: components["schemas"]["Money"];
                            /** @description Net as a percentage of income. 0 when there was no income. */
                            savingsRate: number;
                            range: components["schemas"]["DateRange"];
                        };
                        /** @description One period against another — this month versus last, this year versus last. */
                        monthOverMonth: {
                            current: {
                                income: components["schemas"]["Money"];
                                /** @description Positive: the magnitude spent, not the signed ledger total. */
                                expenses: components["schemas"]["Money"];
                                net: components["schemas"]["Money"];
                                /** @description Net as a percentage of income. 0 when there was no income. */
                                savingsRate: number;
                                range: components["schemas"]["DateRange"];
                            };
                            previous: {
                                income: components["schemas"]["Money"];
                                /** @description Positive: the magnitude spent, not the signed ledger total. */
                                expenses: components["schemas"]["Money"];
                                net: components["schemas"]["Money"];
                                /** @description Net as a percentage of income. 0 when there was no income. */
                                savingsRate: number;
                                range: components["schemas"]["DateRange"];
                            };
                            incomeChangePercent: number;
                            expenseChangePercent: number;
                            netChange: components["schemas"]["Money"];
                        };
                        topCategories: components["schemas"]["CategoryBreakdownItem"][];
                        budgets: {
                            id: components["schemas"]["Uuid"];
                            name: string;
                            percentUsed: number;
                            /** @description `on_track`, `warning` or `exceeded`. */
                            status: string;
                            totalLimit: components["schemas"]["Money"];
                            totalSpent: components["schemas"]["Money"];
                        }[];
                        recentTransactions: components["schemas"]["Transaction"][];
                        upcomingBills: {
                            id: components["schemas"]["Uuid"];
                            name: string;
                            amount: components["schemas"]["Money"];
                            currency: components["schemas"]["CurrencyCode"];
                            dueOn: components["schemas"]["DateOnly"];
                        }[];
                        goals: {
                            id: components["schemas"]["Uuid"];
                            name: string;
                            progressPercent: number;
                            targetAmount: components["schemas"]["Money"];
                            currentAmount: components["schemas"]["Money"];
                        }[];
                        unreadNotifications: components["schemas"]["Integer"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAnalyticsSummary: {
        parameters: {
            query?: {
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                from?: string;
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                to?: string;
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        range: components["schemas"]["DateRange"];
                        totals: components["schemas"]["PeriodTotals"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAnalyticsCategories: {
        parameters: {
            query?: {
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                from?: string;
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                to?: string;
                type?: "expense" | "income";
                depth?: number;
                limit?: number;
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        range: components["schemas"]["DateRange"];
                        categories: components["schemas"]["CategoryBreakdownItem"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAnalyticsTrends: {
        parameters: {
            query?: {
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                from?: string;
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                to?: string;
                unit?: "day" | "week" | "month" | "year";
                months?: number;
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A dense series: a period with no activity is a zero rather than a missing point. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        range: components["schemas"]["DateRange"];
                        points: components["schemas"]["TrendPoint"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAnalyticsNetWorth: {
        parameters: {
            query?: {
                months?: number;
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The running balance at each month end, computed over the whole ledger rather than extrapolated. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        points: {
                            periodEnd: components["schemas"]["DateOnly"];
                            balance: components["schemas"]["Money"];
                        }[];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAnalyticsSavingsRate: {
        parameters: {
            query?: {
                months?: number;
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        points: {
                            period: string;
                            income: components["schemas"]["Money"];
                            expenses: components["schemas"]["Money"];
                            saved: components["schemas"]["Money"];
                            savingsRate: number;
                        }[];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAnalyticsBudgetVariance: {
        parameters: {
            query?: {
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                asOf?: string;
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        rows: {
                            categoryId: components["schemas"]["Uuid"];
                            categoryName: string;
                            budgeted: components["schemas"]["Money"];
                            actual: components["schemas"]["Money"];
                            /** @description Budgeted minus actual, so a negative number is an overspend. */
                            variance: components["schemas"]["Money"];
                            variancePercent: number;
                            /** @enum {string} */
                            status: "under" | "over" | "on_target";
                        }[];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAnalyticsCompare: {
        parameters: {
            query?: {
                unit?: "day" | "week" | "month" | "quarter" | "year";
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                anchor?: string;
                offset?: number;
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One period against another — this month versus last, this year versus last. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        current: {
                            income: components["schemas"]["Money"];
                            /** @description Positive: the magnitude spent, not the signed ledger total. */
                            expenses: components["schemas"]["Money"];
                            net: components["schemas"]["Money"];
                            /** @description Net as a percentage of income. 0 when there was no income. */
                            savingsRate: number;
                            range: components["schemas"]["DateRange"];
                        };
                        previous: {
                            income: components["schemas"]["Money"];
                            /** @description Positive: the magnitude spent, not the signed ledger total. */
                            expenses: components["schemas"]["Money"];
                            net: components["schemas"]["Money"];
                            /** @description Net as a percentage of income. 0 when there was no income. */
                            savingsRate: number;
                            range: components["schemas"]["DateRange"];
                        };
                        incomeChangePercent: number;
                        expenseChangePercent: number;
                        netChange: components["schemas"]["Money"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdAnalyticsInsights: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Rule-based observations, every one traceable to a figure the user can check. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        insights: {
                            /** @enum {string} */
                            type: "overspend" | "savings_opportunity" | "trend" | "positive";
                            title: string;
                            detail: string;
                            /** @description The numbers behind the sentence, when there are any. */
                            data?: {
                                [key: string]: unknown;
                            };
                        }[];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdReportsStatement: {
        parameters: {
            query?: {
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                month?: string;
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A closed statement for one month. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        statement: {
                            workspaceId: components["schemas"]["Uuid"];
                            range: components["schemas"]["DateRange"];
                            baseCurrency: components["schemas"]["CurrencyCode"];
                            /** @description Derived from the ledger before the range, so a past month is reproducible. */
                            openingBalance: components["schemas"]["Money"];
                            closingBalance: components["schemas"]["Money"];
                            totals: components["schemas"]["PeriodTotals"];
                            /** @description Top-level only: subcategories are rolled up. */
                            categories: components["schemas"]["CategoryBreakdownItem"][];
                            accounts: {
                                id: components["schemas"]["Uuid"];
                                name: string;
                                currency: components["schemas"]["CurrencyCode"];
                                /** @description In the account's own currency, not the base currency. */
                                closingBalance: components["schemas"]["Money"];
                            }[];
                            budgets: {
                                name: string;
                                totalLimit: components["schemas"]["Money"];
                                totalSpent: components["schemas"]["Money"];
                                percentUsed: number;
                            }[];
                            transactionCount: components["schemas"]["Integer"];
                        };
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdReportsYearOverYear: {
        parameters: {
            query?: {
                year?: number;
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Twelve months of this year against the same months of last. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        year: components["schemas"]["Integer"];
                        rows: {
                            /** @description The `MM` half of the month key, shared by both years. */
                            month: string;
                            currentIncome: components["schemas"]["Money"];
                            currentExpenses: components["schemas"]["Money"];
                            previousIncome: components["schemas"]["Money"];
                            previousExpenses: components["schemas"]["Money"];
                            /** @description 0 when the prior year had no spending that month — not a 100% fall. */
                            expenseChangePercent: number;
                        }[];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdReportsExportTransactionsCsv: {
        parameters: {
            query?: {
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                from?: string;
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                to?: string;
                accountIds?: string | string[];
                categoryIds?: string | string[];
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The filtered ledger as a CSV attachment. Sent as text, so a client must not let `fetch` try to parse it as JSON. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/csv": string;
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getWorkspacesByWorkspaceIdReportsExportStatementCsv: {
        parameters: {
            query?: {
                /** @description A calendar date as `YYYY-MM-DD`. The date must exist: `2025-02-30` is rejected. */
                month?: string;
            };
            header?: never;
            path: {
                workspaceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One month's statement as a CSV attachment. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/csv": string;
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["ValidationFailed"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getOpenapiJson: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description This document, built from the live app. Byte-identical to the committed `docs/openapi.json`. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        openapi: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            500: components["responses"]["InternalError"];
        };
    };
}
