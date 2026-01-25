import { applyTransformation, applyDifferencing } from './transformations.js';

// Prepare data for regression with transformations
export function prepareRegressionData(data, yColumn, xColumns, yTransform, yDiff, xTransform, xDiff) {
    // Apply transformations to y
    let yValues = data.map(row => parseFloat(row[yColumn]));
    yValues = applyTransformation(yValues, yTransform);
    yValues = applyDifferencing(yValues, yDiff);
    
    // Determine data length after differencing
    const dataLength = yValues.length;
    
    // Prepare x values with transformations
    const xValues = xColumns.map(column => {
        let colValues = data.map(row => parseFloat(row[column]));
        colValues = applyTransformation(colValues, xTransform);
        colValues = applyDifferencing(colValues, xDiff);
        
        // Ensure x and y arrays have the same length
        return colValues.slice(colValues.length - dataLength);
    });
    
    // Create X matrix with intercept
    const X = Array(dataLength).fill().map((_, i) => {
        return [1, ...xValues.map(colValues => colValues[i])];
    });
    
    return { yValues, X, dataLength };
}

// Run multiple linear regression
export function runMultipleRegression(yValues, X) {
    // Remove rows with NaN values
    const validIndices = [];
    for (let i = 0; i < yValues.length; i++) {
        if (!isNaN(yValues[i]) && !X[i].some(isNaN)) {
            validIndices.push(i);
        }
    }
    
    const validY = validIndices.map(i => yValues[i]);
    const validX = validIndices.map(i => X[i]);
    
    if (validY.length < validX[0].length) {
        throw new Error('Not enough valid data points for regression');
    }
    
    // Compute regression using normal equation: β = (X'X)^(-1)X'y
    // Transpose X
    const XT = transposeMatrix(validX);
    
    // Multiply X' and X
    const XTX = multiplyMatrices(XT, validX);
    
    // Compute inverse of X'X
    const XTXInv = invertMatrix(XTX);
    
    if (!XTXInv) {
        throw new Error('Could not compute regression. The design matrix might be singular.');
    }
    
    // Multiply X'X^(-1) with X'
    const XTXInvXT = multiplyMatrices(XTXInv, XT);
    
    // Multiply X'X^(-1)X' with y to get β
    const beta = multiplyMatrixVector(XTXInvXT, validY);
    
    // Calculate fitted values
    const yFitted = validX.map(xi => {
        return xi.reduce((sum, xij, j) => sum + xij * beta[j], 0);
    });
    
    // Calculate residuals
    const residuals = validY.map((yi, i) => yi - yFitted[i]);
    
    // Calculate statistics
    const n = validY.length;
    const p = validX[0].length; // Include intercept
    
    // Total sum of squares
    const yMean = validY.reduce((a, b) => a + b, 0) / n;
    const sst = validY.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    
    // Residual sum of squares
    const ssr = residuals.reduce((sum, r) => sum + r * r, 0);
    
    // R-squared
    const rSquared = 1 - (ssr / sst);
    
    // Adjusted R-squared
    const adjustedRSquared = 1 - ((1 - rSquared) * (n - 1) / (n - p));
    
    // Mean squared error
    const mse = ssr / (n - p);
    
    // Standard errors of coefficients
    const se = beta.map((_, j) => {
        return Math.sqrt(mse * XTXInv[j][j]);
    });
    
    // t-statistics
    const tStats = beta.map((b, j) => b / se[j]);
    
    // p-values (approximation using normal distribution)
    const pValues = tStats.map(t => {
        const absT = Math.abs(t);
        return 2 * (1 - normCDF(absT));
    });
    
    // F-statistic
    const modelSS = sst - ssr;
    const fStat = (modelSS / (p - 1)) / (ssr / (n - p));
    
    // p-value for F-statistic (approximation)
    const pValueModel = 1 - fCDF(fStat, p - 1, n - p);
    
    return {
        beta,
        se,
        tStats,
        pValues,
        rSquared,
        adjustedRSquared,
        fStat,
        pValueModel,
        yFitted,
        validY,
        validX,
        validIndices,
        residuals
    };
}

// Helper function to transpose a matrix
export function transposeMatrix(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    
    const result = Array(cols).fill().map(() => Array(rows).fill(0));
    
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            result[j][i] = matrix[i][j];
        }
    }
    
    return result;
}

// Helper function to multiply matrices
export function multiplyMatrices(a, b) {
    const aRows = a.length;
    const aCols = a[0].length;
    const bRows = b.length;
    const bCols = b[0].length;
    
    if (aCols !== bRows) {
        throw new Error('Cannot multiply matrices: dimensions do not match');
    }
    
    const result = Array(aRows).fill().map(() => Array(bCols).fill(0));
    
    for (let i = 0; i < aRows; i++) {
        for (let j = 0; j < bCols; j++) {
            for (let k = 0; k < aCols; k++) {
                result[i][j] += a[i][k] * b[k][j];
            }
        }
    }
    
    return result;
}

// Helper function to multiply matrix by vector
export function multiplyMatrixVector(matrix, vector) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    
    if (cols !== vector.length) {
        throw new Error('Cannot multiply matrix by vector: dimensions do not match');
    }
    
    const result = Array(rows).fill(0);
    
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            result[i] += matrix[i][j] * vector[j];
        }
    }
    
    return result;
}

// Helper function to invert a matrix (Gauss-Jordan elimination)
export function invertMatrix(matrix) {
    const n = matrix.length;
    
    // Create augmented matrix [A|I]
    const augmented = [];
    for (let i = 0; i < n; i++) {
        augmented[i] = matrix[i].slice();
        for (let j = 0; j < n; j++) {
            augmented[i].push(i === j ? 1 : 0);
        }
    }
    
    // Apply Gauss-Jordan elimination
    for (let i = 0; i < n; i++) {
        // Find pivot
        let pivotRow = i;
        for (let j = i + 1; j < n; j++) {
            if (Math.abs(augmented[j][i]) > Math.abs(augmented[pivotRow][i])) {
                pivotRow = j;
            }
        }
        
        // Check if matrix is singular
        if (Math.abs(augmented[pivotRow][i]) < 1e-10) {
            return null; // Matrix is singular
        }
        
        // Swap rows if needed
        if (pivotRow !== i) {
            [augmented[i], augmented[pivotRow]] = [augmented[pivotRow], augmented[i]];
        }
        
        // Scale pivot row
        const pivot = augmented[i][i];
        for (let j = 0; j < 2 * n; j++) {
            augmented[i][j] /= pivot;
        }
        
        // Eliminate other rows
        for (let j = 0; j < n; j++) {
            if (j !== i) {
                const factor = augmented[j][i];
                for (let k = 0; k < 2 * n; k++) {
                    augmented[j][k] -= factor * augmented[i][k];
                }
            }
        }
    }
    
    // Extract inverse matrix
    const inverse = [];
    for (let i = 0; i < n; i++) {
        inverse[i] = augmented[i].slice(n, 2 * n);
    }
    
    return inverse;
}

// Standard normal CDF approximation
export function normCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
}

// F-distribution CDF approximation
export function fCDF(x, df1, df2) {
    // This is a very rough approximation
    const p = df1 * x / (df1 * x + df2);
    return 1 - Math.pow(1 - p, df2 / 2);
}