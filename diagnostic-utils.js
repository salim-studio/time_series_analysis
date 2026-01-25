// Diagnostic tests for regression model evaluation

// Jarque-Bera test for normality of residuals
export function jarqueBera(residuals) {
    const n = residuals.length;
    
    // Calculate mean
    const mean = residuals.reduce((sum, val) => sum + val, 0) / n;
    
    // Center residuals
    const centeredResiduals = residuals.map(r => r - mean);
    
    // Calculate second moment (variance)
    const m2 = centeredResiduals.reduce((sum, val) => sum + val * val, 0) / n;
    
    // Calculate third moment (for skewness)
    const m3 = centeredResiduals.reduce((sum, val) => sum + val * val * val, 0) / n;
    
    // Calculate fourth moment (for kurtosis)
    const m4 = centeredResiduals.reduce((sum, val) => sum + val * val * val * val, 0) / n;
    
    // Calculate skewness
    const skewness = m3 / Math.pow(m2, 1.5);
    
    // Calculate kurtosis
    const kurtosis = m4 / (m2 * m2) - 3;
    
    // Calculate Jarque-Bera statistic
    const jb = n * (Math.pow(skewness, 2) / 6 + Math.pow(kurtosis, 2) / 24);
    
    // p-value (chi-squared with 2 degrees of freedom)
    const pValue = 1 - chiSquareCDF(jb, 2);
    
    return {
        statistic: jb,
        pValue: pValue,
        isNormal: pValue > 0.05
    };
}

// Breusch-Godfrey test for serial correlation
export function serialCorrelationTest(residuals, X, order = 2) {
    const n = residuals.length;
    const k = X[0].length; // Number of parameters including intercept
    
    // Step 1: Run auxiliary regression of residuals on X and lagged residuals
    // Create lagged residuals arrays
    const laggedResiduals = [];
    for (let lag = 1; lag <= order; lag++) {
        const lagged = Array(lag).fill(0).concat(residuals.slice(0, n - lag));
        laggedResiduals.push(lagged);
    }
    
    // Combine X and lagged residuals for auxiliary regression
    const auxX = X.map((row, i) => {
        return [...row, ...laggedResiduals.map(lr => lr[i])];
    });
    
    // Create auxiliary regression design matrix
    // Transpose auxX for matrix operations
    const auxXT = transposeMatrix(auxX);
    
    // Multiply X' and X
    const auxXTX = multiplyMatrices(auxXT, auxX);
    
    // Compute inverse of X'X
    const auxXTXInv = invertMatrix(auxXTX);
    
    if (!auxXTXInv) {
        // Singular matrix - can't compute test
        return {
            statistic: NaN,
            pValue: NaN,
            hasSerialCorrelation: null
        };
    }
    
    // Multiply X'X^(-1) with X'
    const auxXTXInvXT = multiplyMatrices(auxXTXInv, auxXT);
    
    // Multiply X'X^(-1)X' with residuals to get coefficients
    const auxBeta = multiplyMatrixVector(auxXTXInvXT, residuals);
    
    // Get coefficients for lagged residuals (last 'order' coefficients)
    const lagCoefficients = auxBeta.slice(auxBeta.length - order);
    
    // Calculate fitted values
    const auxFitted = auxX.map(xi => {
        return xi.reduce((sum, xij, j) => sum + xij * auxBeta[j], 0);
    });
    
    // Calculate auxiliary regression residuals
    const auxResiduals = residuals.map((yi, i) => yi - auxFitted[i]);
    
    // Calculate R² of auxiliary regression
    const rss = auxResiduals.reduce((sum, r) => sum + r * r, 0);
    const tss = residuals.reduce((sum, r) => sum + r * r, 0);
    const rSquared = 1 - (rss / tss);
    
    // Calculate LM statistic: LM = n * R²
    const lm = n * rSquared;
    
    // p-value from chi-squared distribution with 'order' degrees of freedom
    const pValue = 1 - chiSquareCDF(lm, order);
    
    return {
        statistic: lm,
        pValue: pValue,
        hasSerialCorrelation: pValue < 0.05
    };
}

// White test for heteroskedasticity
export function heteroskedasticityTest(residuals, X) {
    const n = residuals.length;
    const k = X[0].length; // Number of parameters including intercept
    
    // Step 1: Square the residuals
    const squaredResiduals = residuals.map(r => r * r);
    
    // Step 2: Create auxiliary regression design matrix with:
    // - Original X variables
    // - Squares of X variables (excluding intercept)
    // - Cross products of X variables (excluding intercept)
    const auxX = [];
    
    for (let i = 0; i < n; i++) {
        const row = [1]; // Intercept
        
        // Add original X variables (excluding intercept)
        for (let j = 1; j < k; j++) {
            row.push(X[i][j]);
        }
        
        // Add squares of X variables
        for (let j = 1; j < k; j++) {
            row.push(X[i][j] * X[i][j]);
        }
        
        // Add cross products (only if k > 2)
        if (k > 2) {
            for (let j = 1; j < k - 1; j++) {
                for (let l = j + 1; l < k; l++) {
                    row.push(X[i][j] * X[i][l]);
                }
            }
        }
        
        auxX.push(row);
    }
    
    // Calculate the number of regressors in auxiliary regression (excluding intercept)
    const q = auxX[0].length - 1;
    
    // Transpose auxX for matrix operations
    const auxXT = transposeMatrix(auxX);
    
    // Multiply X' and X
    const auxXTX = multiplyMatrices(auxXT, auxX);
    
    // Compute inverse of X'X
    const auxXTXInv = invertMatrix(auxXTX);
    
    if (!auxXTXInv) {
        // Singular matrix - can't compute test
        return {
            statistic: NaN,
            pValue: NaN,
            hasHeteroskedasticity: null
        };
    }
    
    // Multiply X'X^(-1) with X'
    const auxXTXInvXT = multiplyMatrices(auxXTXInv, auxXT);
    
    // Multiply X'X^(-1)X' with squared residuals to get coefficients
    const auxBeta = multiplyMatrixVector(auxXTXInvXT, squaredResiduals);
    
    // Calculate fitted values
    const auxFitted = auxX.map(xi => {
        return xi.reduce((sum, xij, j) => sum + xij * auxBeta[j], 0);
    });
    
    // Calculate auxiliary regression residuals
    const auxResiduals = squaredResiduals.map((yi, i) => yi - auxFitted[i]);
    
    // Calculate R² of auxiliary regression
    const rss = auxResiduals.reduce((sum, r) => sum + r * r, 0);
    const tss = squaredResiduals.reduce((sum, r) => sum + r * r, 0);
    const rSquared = 1 - (rss / tss);
    
    // Calculate LM statistic: LM = n * R²
    const lm = n * rSquared;
    
    // p-value from chi-squared distribution with q degrees of freedom
    const pValue = 1 - chiSquareCDF(lm, q);
    
    return {
        statistic: lm,
        pValue: pValue,
        hasHeteroskedasticity: pValue < 0.05
    };
}

// Chi-square CDF approximation (Wilson-Hilferty transformation)
function chiSquareCDF(x, df) {
    if (x <= 0) return 0;
    
    // For df > 30, use normal approximation
    if (df > 30) {
        const z = Math.sqrt(2 * x) - Math.sqrt(2 * df - 1);
        return normCDF(z);
    }
    
    // For small df, use Wilson-Hilferty approximation
    const z = (Math.pow(x / df, 1/3) - (1 - 2/(9 * df))) / Math.sqrt(2/(9 * df));
    return normCDF(z);
}

// Helper function for standard normal CDF
function normCDF(x) {
    // Constants for approximation
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    
    // Save the sign
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    
    // Formula 7.1.26 from Abramowitz and Stegun
    const t = 1.0 / (1.0 + p * absX);
    const erf = 1.0 - (a1 * t + a2 * t * t + a3 * t * t * t + 
                       a4 * t * t * t * t + a5 * t * t * t * t * t) * 
                       Math.exp(-absX * absX);
    
    return 0.5 * (1 + sign * erf);
}

// Import matrix utility functions from regression-utils.js
import { transposeMatrix, multiplyMatrices, multiplyMatrixVector, invertMatrix } from './regression-utils.js';