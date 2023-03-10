export type Ident = string | number | symbol;
export type UnifyError<T> = {
    kind: 'occurs',
    identifier: Ident,
    term: T,
    topTerm1?: T,
    topTerm2?: T
} | {
    kind: 'name-clash',
    name1: Ident,
    name2: Ident,
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
} | {
    kind: 'missing-label',
    labelSubTerms1: Map<string, T>,
    labelSubTerms2: Map<string, T>,
    topTerm1?: T,
    topTerm2?: T
}

export type UnifyOptions<T> = {
    extract: (x: T) => { isVar: boolean, x: Ident, subterms?: T[], labelledSubterms?: Map<string, T>, row?: T },
    createRowType?: (x: T, labelledTerms: Set<string>) => T,
    substitute: (x: T, u: Map<Ident, T>) => T,
    initialSubstitution?: Map<Ident, T> | [Ident, T][] | { [k: Ident]: T };
    trace?: boolean;
};

export class Unify<T> {
    constructor(readonly options: UnifyOptions<T>) {
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

    private _state: Map<Ident, T>;

    private _error?: UnifyError<T>;

    get unfifies() {
        return this._error == null;
    }

    errorString(): string {
        const { _error } = this;
        switch (_error?.kind) {
            case 'occurs': {
                const x = String(_error.identifier);
                const a = this.termToString(_error.term);
                if (_error.topTerm1 != null && _error.topTerm2 != null) {
                    const t1 = this.termToString(_error.topTerm1);
                    const t2 = this.termToString(_error.topTerm2);
                    if (t1 !== x || t2 !== a)
                        return `Occurs check failed. ${x} occurs in ${a} (in ${t1} == ${t2}).`
                }
                return `Occurs check failed. ${x} occurs in ${a}.`;
            }
            case 'arity':
            case 'name-clash': {
                const a = this.termToString(_error.term1);
                const b = this.termToString(_error.term2);
                const t1 = this.termToString(_error.topTerm1);
                const t2 = this.termToString(_error.topTerm2);
                if (t1 !== a || t2 !== b)
                    return `Failed to unify ${a} and ${b} (in ${t1} == ${t2}).`
                return `Failed to unify ${a} and ${b}.`
            }
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
        const { isVar, x, subterms, labelledSubterms, row } = extract(a);
        if (isVar) {
            return String(x);
        }

        const args = [
            ...(subterms ?? [])?.map(a0 => this.termToString(a0)),
            ...[...labelledSubterms?.entries() ?? []].map(([x, a0]) => `${x}: ${this.termToString(a0)}`),
            ...row == null ? [] : [this.termToString(row)]
        ];
        return `${String(x)}(${args.join(', ')})`;
    }

    entries(): [Ident, T][] {
        return [...this._state.entries()];
    }

    substitute(a: T): T {
        const { substitute } = this.options;

        return substitute(a, this._state);
    }

    addMapping(x: Ident, a: T): this {
        this.substitute(a);
        this._addMapping(x, a)
        return this;
    }

    private _addMapping(x: Ident, a: T, topTerm1?: T, topTerm2?: T) {

        const occurs = (x: Ident, a: T): boolean => {
            const { extract } = this.options;
            const { isVar, x: y, subterms, labelledSubterms, row } = extract(a);
            if (isVar) {
                return x === y;
            }
            if(labelledSubterms) for(const [_, a0] of labelledSubterms) {
                if(occurs(x, a0))
                    return true;
            }
            if(row && occurs(x, row))
                return true;
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
        const { extract, trace, createRowType } = this.options;
        const stack: [T, T, number][] = [[term1, term2, 0]];

        let entry: [T, T, number] | undefined;
        while (entry = stack.pop()) {

            if (this._error != null)
                return this;

            const a = this.substitute(entry[0]);
            const b = this.substitute(entry[1]);

            const { isVar: isVarA, x, subterms: as, labelledSubterms: amap, row: arow } = extract(a);
            const { isVar: isVarB, x: y, subterms: bs, labelledSubterms: bmap, row: brow } = extract(b);
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
            else {
                for (let i = as1.length - 1; i >= 0 && this._error == null; --i) {
                    stack.push([as1[i], bs1[i], entry[2] + 1]);
                }

                const unique1: Map<string, T> = new Map();
                const unique2 = new Map(bmap);
                for (const [x, a0] of amap?.entries() ?? []) {
                    const b0 = unique2.get(x);
                    if (b0 == null) {
                        unique1.set(x, a0);
                    }
                    else {
                        unique2.delete(x);
                        stack.push([a0, b0, entry[2] + 1]);
                    }
                }
                if (createRowType && arow && brow) {

                    if (unique1.size == 0 && unique2.size == 0)
                        stack.push([arow, brow, entry[2] + 1]);
                    else {

                        let a_, b_: T | undefined;

                        if (unique1.size > 0) {
                            a_ = createRowType(a, new Set(unique1.keys()));
                            stack.push([brow, a_, entry[2] + 1]);
                        }

                        if (unique2.size > 0) {
                            b_ = createRowType(b, new Set(unique2.keys()));
                            stack.push([arow, b_, entry[2] + 1]);
                        }

                        if(trace) {
                            const indent = " ".repeat(entry[2] * 2);
                        }
                        const newRowA = a_ == null ? brow : extract(a_).row;
                        const newRowB = b_ == null ? arow : extract(b_).row;
                        if (newRowA && newRowB)
                            stack.push([newRowA, newRowB, entry[2] + 1]);
                    }
                }
                else {
                    if (unique1.size > 0 || unique2.size > 0) {
                        this._error = {
                            kind: 'missing-label',
                            labelSubTerms1: unique1,
                            labelSubTerms2: unique2,
                            topTerm1: term1,
                            topTerm2: term2
                        }
                    }
                }
            }

            if (trace) {
                const indent = " ".repeat(entry[2] * 2);
                console.log(`${indent}UNIFY`, this.termToString(a), "==", this.termToString(b));
                if (unificationChanged)
                    console.log(`${indent}\\` + this.toString(`\n${indent} `));
            }
        }

        return this;
    }
}
