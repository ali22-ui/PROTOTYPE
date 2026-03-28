import Provider from './provider';
import { AppRoutes } from './routes';

export default function App() {
  return (
    <Provider>
      <AppRoutes />
    </Provider>
  );
}
