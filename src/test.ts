import { Unify, UnifyOptions } from ".";

// Terms of the form
// x ::= <<lowercase string>>
// F ::= <<uppercase string>>
// t ::= x | F | F(t, ..., t)
const options: UnifyOptions<string> = {
    trace: true,
    construct: (f, xs) => `${String(f)}(${xs.join(', ')})`,
    extract: x => {
        x = x.trim();
        if (x[0].toLowerCase() == x[0]) {
            return {
                isVar: true,
                x: x
            }
        }
        let i = x.indexOf('(');
        if(i === -1) {
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
        while (n > 0) {
            j++;
            if (x[j] == null)
                throw new Error();
            if (x[j] === ')') {
                n--;
                if (n === 0) {
                    const a0 = x.substring(i, j).trim();
                    if (a0)
                        as.push(a0)
                }
            }
            if (x[j] === '(')
                n++;
            if (x[j] === ',' && n === 1) {
                as.push(x.substring(i, j).trim())
                i = j + 1;
            }
        }
        return {
            isVar: false,
            x: f,
            subterms: as
        };
    }
}


test("TestWorks", true, u => u
    .unify("z", "F(a,a)"),
    "F(x, x, x)", "F(y, G(y0, y0), G(z, z))"
);

function exponentialCase(n: number) {
    test("TestExponential" + n, true, u => {
        for(let i = n; i > 0; --i) {
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

let nFailed = 0;
function test(name: string, expectUnifies: boolean, f: (u: Unify<string>) => void, a?: string, b?: string) {

    console.log('=', name,'==================================================')
    const unify = new Unify(options);
    f(unify);
    if(a != null && b != null) {
        unify.unify(a,b);
    }


    console.log('Result:');
    console.log(unify.toString());

    if(a != null && b != null) {
        const a0 = unify.substitute(a);
        const b0 = unify.substitute(b);
        const string = unify.termToString(a0);
        console.log('Unified terms do unify:', string === unify.termToString(b0), string);
    }
    if(expectUnifies === unify.unfifies)
        console.log('TEST SUCCESSFUL')
    else {
        console.error('TEST FAILED')
        nFailed++;
    }
}

if(nFailed === 0)
    console.info('ALL TEST SUCCESSFUL');
else {
    console.error(nFailed + " TEST(S) FAILED");
}
