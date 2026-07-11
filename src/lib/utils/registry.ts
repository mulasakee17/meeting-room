/**
 * Registry<T> — 泛型注册表基类
 *
 * 消除 AdapterRegistry 等重复实现。子类只需指定 key 类型和 value 类型。
 */

export class Registry<K, V> {
  protected items: Map<K, V> = new Map();

  register(key: K, value: V): void {
    this.items.set(key, value);
  }

  get(key: K): V | undefined {
    return this.items.get(key);
  }

  has(key: K): boolean {
    return this.items.has(key);
  }

  list(): K[] {
    return Array.from(this.items.keys());
  }

  listValues(): V[] {
    return Array.from(this.items.values());
  }

  clear(): void {
    this.items.clear();
  }

  get size(): number {
    return this.items.size;
  }
}
