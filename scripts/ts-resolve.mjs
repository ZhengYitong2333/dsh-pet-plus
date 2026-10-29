/** 让 Node 的 ESM loader 解析无扩展名的相对 TS 导入（仅测试/开发用）。 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      try {
        return await next(specifier + '.ts', context);
      } catch {
        try {
          return await next(specifier + '/index.ts', context);
        } catch {
          throw error;
        }
      }
    }
    throw error;
  }
}
