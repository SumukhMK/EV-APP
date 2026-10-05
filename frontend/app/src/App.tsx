import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { SessionProvider } from './app/session';
import { theme } from './theme/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A live desk has other people, other tabs and the API itself changing
      // the data. Within a tab every save invalidates what it touched; for
      // everything else, a screen refetches when you arrive at it and when
      // the tab comes back into focus. Five seconds of freshness stops rapid
      // back-and-forth navigation re-hitting the API for nothing.
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
      staleTime: 5_000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <ThemeProvider theme={theme} defaultMode="dark" modeStorageKey="fleetech-mode">
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
