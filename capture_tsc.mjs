
import { execSync } from 'child_process';
import fs from 'fs';

try {
    console.log('Running tsc...');
    const output = execSync('npx tsc --noEmit', { encoding: 'utf8' });
    fs.writeFileSync('tsc_errors_utf8.txt', output || 'No errors found.');
    console.log('Done (no errors).');
} catch (error) {
    console.log('Errors found, writing to tsc_errors_utf8.txt');
    fs.writeFileSync('tsc_errors_utf8.txt', error.stdout || error.stderr || error.message);
}
