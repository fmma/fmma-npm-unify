import { Ident, Unify, UnifyOptions } from ".";

const construct = (f: Ident, xs: string[], xmap: Map<string, string>, r?: string) => `${String(f)}(${[
    ...xs,
    ...[...xmap.entries()].sort((a,b) => a[0] < b[0] ? -1 : a[0] === b[0] ? 0 : 1).map(([x,a])=>`${x} : ${a}`),
    ...r==null?[]:[r]
].join(', ')})`;

// Terms of the form
// x ::= <<lowercase string>>
// F ::= <<uppercase string>>
// t ::= x | F | F(t, ..., t)

let i = 0;
const options: UnifyOptions<string> = {
    trace: true,
    substitute: (a, u) => {
        let {
            isVar,
            x,
            subterms,
            labelledSubterms,
            row
        } = options.extract(a);
        if(isVar) {
            return u.get(x) ?? a;
        }
        subterms = subterms == null ? undefined : subterms.map(a0 => options.substitute(a0, u));
        labelledSubterms = labelledSubterms == null ? undefined : new Map([...labelledSubterms.entries()].map(([x,a0]) => [x, options.substitute(a0, u)]));
        row = row == null ? undefined : options.substitute(row, u);

        if(row) {
            const x = options.extract(row);
            if(!x.isVar) {
                subterms = [...subterms ?? [], ...x.subterms ?? []];
                for(const [x0, a0] of x.labelledSubterms ?? new Map()) {
                    labelledSubterms?.set(x0, a0);
                }
                row = x.row;
            }
        }

        return construct(x, subterms ?? [], labelledSubterms ?? new Map(), row);
    },
    createRowType: (x, keys) => {
        let {x: f, labelledSubterms: xmap} = options.extract(x);
        return `${String(f)}(${[...xmap?.entries() ?? []].filter(x => keys.has(x[0])).map(([y,a]) => `${y}: ${a}`).join(',')}, rr${i++})`;
    },
    extract: x => {
        x = x.trim();
        if (x[0].toLowerCase() == x[0]) {
            return {
                isVar: true,
                x: x
            }
        }
        let i = x.indexOf('(');
        if (i === -1) {
            return {
                isVar: false,
                x
            }
        }
        const f = x.substring(0, i).trim();
        let j = i;
        let n = 1;

        i++;
        const as: string[] = [];
        const amap: Map<string, string> = new Map();
        let arow: string | undefined;
        let key: string | undefined;
        while (n > 0) {
            j++;
            if (x[j] == null)
                throw new Error();
            if (x[j] === ')') {
                n--;
                if (n === 0) {
                    const a0 = x.substring(i, j).trim();
                    if (a0) {
                        if (key)
                            amap.set(key, a0)
                        else if (amap.size > 0)
                            arow = a0;
                        else
                            as.push(a0)
                    }
                }
            }
            if (x[j] === '(')
                n++;
            if (x[j] === ',' && n === 1) {
                if (key)
                    amap.set(key, x.substring(i, j).trim())
                else
                    as.push(x.substring(i, j).trim())
                key = undefined;
                i = j + 1;
            }
            if (x[j] === ':' && n === 1) {
                key = x.substring(i, j).trim();
                i = j + 1;
            }
        }

        return {
            isVar: false,
            x: f,
            subterms: as,
            labelledSubterms: amap,
            row: arow
        };
    }
}


test("TestWorks", true, u => u
    .unify("z", "F(a,a)"),
    "F(x, x, x)", "F(y, G(y0, y0), G(z, z))"
);

function exponentialCase(n: number) {
    test("TestExponential" + n, true, u => {
        for (let i = n; i > 0; --i) {
            u.unify(`x${i}`, `G(x${i + 1}, x${i + 1})`);
        }
    }, `x0`, `G(x1, x1)`)
}
exponentialCase(1);
exponentialCase(4);
exponentialCase(7);

test("TestOccursFails", false, u => u
    .unify("w", "F(G(A, B, x))")
    .unify("x", "H(y)")
    .unify("z", "Foo(w, w)")
    .unify("y", "Q(A, B, z)")
);
test("NameClashFails", false, u => u
    .unify("F(x)", "F(G(y))")
    .unify("x", "H(y)")
)

test("ArityFails", false, u => u
    .unify("F(x)", "F(G(y))")
    .unify("x", "G(y,y)")
)

test("Bug1", true, u => u
    .unify("F(x,x)", "F(Number,y)"));

test("Row", true, u => u,
    "F(foo:x, r1)", "F(bar:y, foo:F(y), r2)"
);

let nFailed = 0;
function test(name: string, expectUnifies: boolean, f: (u: Unify<string>) => void, a?: string, b?: string) {

    console.log('=', name, '==================================================')
    const unify = new Unify(options);
    f(unify);
    if (a != null && b != null) {
        unify.unify(a, b);
    }

    console.log('Result:');
    console.log(unify.toString());

    if (a != null && b != null) {
        const a0 = unify.substitute(a);
        const b0 = unify.substitute(b);
        const string1 = unify.termToString(a0);
        const string2 = unify.termToString(b0);
        const doUnify = string1 === string2;
        console.log('Unified terms do unify:', doUnify, string1, string2);
        if(!doUnify)
            nFailed++;
    }
    if (expectUnifies === unify.unfifies)
        console.log('TEST SUCCESSFUL')
    else {
        console.error('TEST FAILED')
        nFailed++;
    }
}

if (nFailed === 0)
    console.info('ALL TEST SUCCESSFUL');
else {
    console.error(nFailed + " TEST(S) FAILED");
}
