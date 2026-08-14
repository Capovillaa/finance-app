import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store';

/** Pre-typed `useDispatch`, so thunks keep their return types. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();

/** Pre-typed `useSelector`, so `state` is never `any`. */
export const useAppSelector = useSelector.withTypes<RootState>();
