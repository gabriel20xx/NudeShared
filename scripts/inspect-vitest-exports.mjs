import * as v from 'vitest';
console.log('vitest exports sample:', Object.keys(v).slice(0,20));
console.log('has test:', typeof v.test);
