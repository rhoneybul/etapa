import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockUrl = 'file://' + path.join(__dirname, 'mockStorageService.js');

// Redirect storageService imports to mock, and add .js extension for bare imports
export function resolve(specifier, context, nextResolve) {
  // Intercept storageService
  if (specifier.endsWith('/storageService') || specifier === './storageService') {
    return { url: mockUrl, shortCircuit: true };
  }

  // For relative imports missing .js extension, try adding it
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (!path.extname(specifier)) {
      const withJs = specifier + '.js';
      return nextResolve(withJs, context);
    }
  }

  return nextResolve(specifier, context);
}
