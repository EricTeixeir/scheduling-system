import { isNonEmptyString } from '@scheduling/shared';

const APP_TITLE = 'Scheduling System';

export function App() {
  return <h1>{isNonEmptyString(APP_TITLE) ? APP_TITLE : 'Untitled'}</h1>;
}
