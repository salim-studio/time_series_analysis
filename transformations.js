// Time series transformations and utilities
export const transformations = {
    none: {
        name: "None",
        transform: (x) => x,
        inverse: (x) => x
    },
    log: {
        name: "Log (ln)",
        transform: (x) => Math.log(Math.max(x, 0.000001)),
        inverse: (x) => Math.exp(x)
    },
    square: {
        name: "Square (x²)",
        transform: (x) => x * x,
        inverse: (x) => Math.sqrt(Math.abs(x))
    },
    sqrt: {
        name: "Square Root (√x)",
        transform: (x) => Math.sqrt(Math.abs(x)),
        inverse: (x) => x * x
    },
    inverse: {
        name: "Inverse (1/x)",
        transform: (x) => x !== 0 ? 1 / x : 999999,
        inverse: (x) => x !== 0 ? 1 / x : 0
    },
    cube: {
        name: "Cube (x³)",
        transform: (x) => x * x * x,
        inverse: (x) => Math.cbrt(x)
    },
    boxcox: {
        name: "Box-Cox (λ=0.5)",
        transform: (x) => x > 0 ? (Math.pow(x, 0.5) - 1) / 0.5 : 0,
        inverse: (x) => Math.pow(0.5 * x + 1, 1 / 0.5)
    }
};

// Difference operations
export const differenceOperations = {
    none: {
        name: "None",
        apply: (data) => data
    },
    first: {
        name: "First Difference",
        apply: (data) => {
            return data.slice(1).map((val, i) => val - data[i]);
        }
    },
    second: {
        name: "Second Difference",
        apply: (data) => {
            const firstDiff = differenceOperations.first.apply(data);
            return differenceOperations.first.apply(firstDiff);
        }
    },
    seasonal: {
        name: "Seasonal (lag=12)",
        apply: (data) => {
            return data.slice(12).map((val, i) => val - data[i]);
        }
    }
};

// AR-MA Models
export const timeSeriesModels = {
    none: {
        name: "None"
    },
    ar1: {
        name: "AR(1)"
    },
    ar2: {
        name: "AR(2)"
    },
    ma1: {
        name: "MA(1)"
    },
    ma2: {
        name: "MA(2)"
    },
    arma11: {
        name: "ARMA(1,1)"
    }
};

// Function to apply transformation to data
export function applyTransformation(data, transformType) {
    if (!transformations[transformType]) {
        return data;
    }
    return data.map(val => transformations[transformType].transform(Number(val)));
}

// Function to apply differencing
export function applyDifferencing(data, differenceType) {
    if (!differenceOperations[differenceType]) {
        return data;
    }
    return differenceOperations[differenceType].apply(data);
}