import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./components/ui";
import { createQueryClient } from "./lib/queryClient";
import "./styles.css";

// Dev-only, and loaded on demand so it never reaches the production bundle.
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const mod = await import("@tanstack/react-query-devtools");
      return { default: mod.ReactQueryDevtools };
    })
  : null;

const queryClient = createQueryClient();

const container = document.getElementById("root");
if (!container) {
  throw new Error('The app could not start: no element with id="root".');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ErrorBoundary>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ErrorBoundary>
      </ToastProvider>
      {ReactQueryDevtools ? (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  </StrictMode>,
);
