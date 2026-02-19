import { createContext, useContext, useCallback, useRef, useSyncExternalStore } from 'react';

type FormDirtyContextValue = {
  setDirty: (dirty: boolean) => void;
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => boolean;
};

const FormDirtyContext = createContext<FormDirtyContextValue | null>(null);

export function FormDirtyProvider({ children }: { children: React.ReactNode }) {
  const dirtyRef = useRef(false);
  const listenersRef = useRef(new Set<() => void>());

  const setDirty = useCallback((dirty: boolean) => {
    if (dirtyRef.current !== dirty) {
      dirtyRef.current = dirty;
      listenersRef.current.forEach((cb) => cb());
    }
  }, []);

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  const getSnapshot = useCallback(() => dirtyRef.current, []);

  return (
    <FormDirtyContext.Provider value={{ setDirty, subscribe, getSnapshot }}>
      {children}
    </FormDirtyContext.Provider>
  );
}

export function useFormDirty() {
  const ctx = useContext(FormDirtyContext);
  if (!ctx) throw new Error('useFormDirty must be used inside FormDirtyProvider');
  const isDirty = useSyncExternalStore(ctx.subscribe, ctx.getSnapshot);
  return { isDirty, setDirty: ctx.setDirty };
}
