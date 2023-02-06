export type Identifier = string | number | symbol;
export type UnificationError<T> = {
    kind: 'occurs',
    identifier: Identifier,
    term: T,
    topTerm1?: T,
    topTerm2?: T
} | {
    kind: 'name-clash',
    name1: Identifier,
    name2: Identifier,
    term1: T,
    term2: T,
    topTerm1: T,
    topTerm2: T
} | {
    kind: 'arity',
    arity1: number,
    arity2: number,
    term1: T,
    term2: T,
    topTerm1: T,
    topTerm2: T
}

export type UnificationOptions<T> = {
    extract: (x: T) => { isVar: boolean, x: Identifier, subterms?: T[] },
    mapChildren?: (x: T, visitChild: (x: T) => T) => T,
    construct?: (name: Identifier, subterms: T[]) => T,
    initialSubstitution?: Map<Identifier, T> | [Identifier, T][] | { [k: Identifier]: T };
    trace?: boolean;
};

export class Unify<T> {
    constructor(readonly options: UnificationOptions<T>) {
        if (options.mapChildren == null && options.construct == null)
            throw new Error('Must define one of options.constuct or options.mapChildren.');
        const u = options.initialSubstitution;
        if (u instanceof Map)
            this._state = u;
        else if (typeof u === 'object')
            this._state = new Map(Object.entries(u));
        else if (Array.isArray(u))
            this._state = new Map(u);
        else
            this._state = new Map();
    }

    private _state: Map<Identifier, T>;

    private _error?: UnificationError<T>;

    get unfifies() {
        return this._error == null;
    }

    errorString(): string {
        const { _error} = this;
        switch(_error?.kind) {
            case 'occurs':
                const x = String(_error.identifier);
                const a = this.termToString(_error.term);
                if(_error.topTerm1 != null && _error.topTerm2 != null ) {
                    const t1 = this.termToString(_error.topTerm1);
                    const t2 = this.termToString(_error.topTerm2);
                    if(t1 !== x || t2 !== a)
                        return `Occurs check failed. ${x} occurs in ${a} (in ${t1} == ${t2}).`
                }
                return `Occurs check failed. ${x} occurs in ${a}.`;
            case 'arity':
            case 'name-clash': `Failed to unify ${this.termToString(_error.term1)} and ${this.termToString(_error.term2)}.`
            default: return '';
        }
    }

    substitutionString(seperator = "\n"): string {
        return `${[...this._state.entries()].map(x => `${String(x[0])} => ${this.termToString(x[1])}`).join(seperator)}`;
    }

    toString(seperator = "\n"): string {
        if (this.unfifies)
            return this.substitutionString(seperator);
        return this.errorString();
    }

    clone(): Unify<T> {
        return new Unify({ ...this.options, initialSubstitution: this.entries() })
    }

    termToString(a: T): string {
        const { extract } = this.options;
        const { isVar, x, subterms } = extract(a);
        if (isVar) {
            return String(x);
        }

        return `${String(x)}(${(subterms ?? [])?.map(a0 => this.termToString(a0)).join(', ')})`;
    }

    entries(): [Identifier, T][] {
        return [...this._state.entries()];
    }

    substitute(a: T): T {
        const { extract, mapChildren, construct } = this.options;

        const { isVar, x, subterms } = extract(a);
        if (isVar) {
            return this._state.get(x) ?? a
        }

        if (construct != null)
            return construct(x, (subterms ?? []).map(a0 => this.substitute(a0)))
        else if (mapChildren != null)
            return mapChildren(a, a0 => this.substitute(a0));
        throw new Error('Must define one of options.constuct or options.mapChildren.');
    }

    addMapping(x: Identifier, a: T): this {
        this._addMapping(x, a)
        return this;
    }

    private _addMapping(x: Identifier, a: T, topTerm1?: T, topTerm2?: T) {

        const occurs = (x: Identifier, a: T): boolean => {
            const { extract } = this.options;
            const { isVar, x: y, subterms } = extract(a);
            if (isVar) {
                return x === y;
            }

            return subterms?.some(a0 => occurs(x, a0)) ?? false;
        }

        if (occurs(x, a)) {
            this._error = {
                kind: 'occurs',
                identifier: x,
                term: a,
                topTerm1,
                topTerm2
            }
            return this;
        }
        const prevState = this._state;
        this._state = new Map([[x, a]]);
        for (const [y, b] of prevState.entries())
            prevState.set(y, this.substitute(b));
        prevState.set(x, a);
        this._state = prevState;
        return this;
    }

    solve(abs: [T, T][]): this {
        for (const [a, b] of abs) {
            this.unify(a, b);
        }
        return this;
    }

    unify(term1: T, term2: T): this {
        const { extract, trace } = this.options;
        const stack: [T, T, number][] = [[term1, term2, 0]];

        let entry: [T, T, number] | undefined;
        while (entry = stack.pop()) {

            if (this._error != null)
                return this;

            const a = this.substitute(entry[0]);
            const b = this.substitute(entry[1]);

            const { isVar: isVarA, x, subterms: as } = extract(a);
            const { isVar: isVarB, x: y, subterms: bs } = extract(b);
            const as1 = as ?? [];
            const bs1 = bs ?? [];

            let unificationChanged = false;

            if (isVarA) {
                if (!isVarB || x !== y) {
                    this._addMapping(x, b, term1, term2);
                    unificationChanged = true;
                }
            }
            else if (isVarB) {
                this._addMapping(y, a, term1, term2);
                unificationChanged = true;
            }
            else if (x !== y) {
                this._error = {
                    kind: 'name-clash',
                    name1: x,
                    name2: y,
                    term1: a,
                    term2: b,
                    topTerm1: term1,
                    topTerm2: term2
                };
            }
            else if (as1.length !== bs1.length) {
                this._error = {
                    kind: 'arity',
                    arity1: as1.length,
                    arity2: bs1.length,
                    term1: a,
                    term2: b,
                    topTerm1: term1,
                    topTerm2: term2
                };
            }
            else for (let i = as1.length - 1; i >= 0 && this._error == null; --i) {
                stack.push([as1[i], bs1[i], entry[2] + 1]);
            }

            if (trace) {
                const indent = " ".repeat(entry[2] * 2);
                console.log(`${indent}UNIFY`, this.termToString(a), "==", this.termToString(b));
                if(unificationChanged)
                    console.log(`${indent}\\` + this.toString(`\n${indent} `));
            }
        }

        return this;
    }
}
