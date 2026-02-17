
import { foo, baz } from './exporter';
import { local } from './exporter';
import { ghost } from './exporter'; // This should fail

console.log(foo, baz, local);
