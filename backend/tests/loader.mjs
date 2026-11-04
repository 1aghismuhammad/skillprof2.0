import { pathToFileURL } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve('.');

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return nextResolve('next/server.js', context);
  }
  if (specifier.startsWith('@/')) {
    const relativePath = specifier.slice(2);
    let targetPath = path.join(projectRoot, relativePath);
    if (!path.extname(targetPath)) {
      targetPath += '.js';
    }
    const resolvedUrl = pathToFileURL(targetPath).href;
    return nextResolve(resolvedUrl, context);
  }
  return nextResolve(specifier, context);
}
