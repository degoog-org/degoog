export interface Signal<T> {
  value: T;
  peek: () => T;
}

export interface ReadonlySignal<T> {
  readonly value: T;
  peek: () => T;
}

interface Reaction {
  run: () => void;
  deps: Set<Set<Reaction>>;
  active: boolean;
}

let _current: Reaction | null = null;
let _batchDepth = 0;
const _queued = new Set<Reaction>();

const _track = (subscribers: Set<Reaction>): void => {
  if (!_current) return;
  subscribers.add(_current);
  _current.deps.add(subscribers);
};

const _notify = (subscribers: Set<Reaction>): void => {
  for (const reaction of [...subscribers]) {
    if (!reaction.active) continue;
    if (_batchDepth > 0) _queued.add(reaction);
    else reaction.run();
  }
};

const _unlink = (reaction: Reaction): void => {
  for (const subscribers of reaction.deps) subscribers.delete(reaction);
  reaction.deps.clear();
};

export const signal = <T>(initial: T): Signal<T> => {
  let value = initial;
  const subscribers = new Set<Reaction>();
  return {
    get value(): T {
      _track(subscribers);
      return value;
    },
    set value(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      _notify(subscribers);
    },
    peek: (): T => value,
  };
};

export const effect = (fn: () => void): (() => void) => {
  const reaction: Reaction = {
    active: true,
    deps: new Set(),
    run: (): void => {
      if (!reaction.active) return;
      _unlink(reaction);
      const previous = _current;
      _current = reaction;
      try {
        fn();
      } finally {
        _current = previous;
      }
    },
  };
  reaction.run();
  return (): void => {
    reaction.active = false;
    _unlink(reaction);
  };
};

export const computed = <T>(fn: () => T): ReadonlySignal<T> => {
  const holder = signal<T>(undefined as T);
  effect(() => {
    holder.value = fn();
  });
  return {
    get value(): T {
      return holder.value;
    },
    peek: holder.peek,
  };
};

export const batch = (fn: () => void): void => {
  _batchDepth++;
  try {
    fn();
  } finally {
    _batchDepth--;
    if (_batchDepth === 0) {
      const ready = [..._queued];
      _queued.clear();
      for (const reaction of ready) reaction.run();
    }
  }
};

/** Read a signal without subscribing the surrounding effect to it. */
export const untracked = <T>(fn: () => T): T => {
  const previous = _current;
  _current = null;
  try {
    return fn();
  } finally {
    _current = previous;
  }
};
