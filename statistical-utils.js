// Statistical utilities for regression analysis

// Calculate Durbin-Watson statistic for autocorrelation
export function calculateDurbinWatson(residuals) {
    let sumSquaredDiff = 0;
    let sumSquaredResiduals = 0;
    
    for (let i = 1; i < residuals.length; i++) {
        sumSquaredDiff += Math.pow(residuals[i] - residuals[i-1], 2);
    }
    
    for (let i = 0; i < residuals.length; i++) {
        sumSquaredResiduals += residuals[i] * residuals[i];
    }
    
    return sumSquaredDiff / sumSquaredResiduals;
}

// Determine significance based on p-value
export function isSignificant(pValue, alpha = 0.05) {
    return pValue < alpha;
}

// Format regression equation based on coefficients and variable names
export function formatRegressionEquation(beta, xColumns, yColumn, yTransform, xTransform) {
    let leftSide = yColumn;
    if (yTransform !== 'none') {
        leftSide = `${getTransformSymbol(yTransform)}(${yColumn})`;
    }
    
    let rightSide = `${beta[0].toFixed(4)}`;
    
    xColumns.forEach((column, i) => {
        const coefficient = beta[i + 1];
        const sign = coefficient >= 0 ? '+' : '';
        let term = column;
        
        if (xTransform !== 'none') {
            term = `${getTransformSymbol(xTransform)}(${column})`;
        }
        
        rightSide += ` ${sign} ${coefficient.toFixed(4)} × ${term}`;
    });
    
    return `${leftSide} = ${rightSide}`;
}

// Get mathematical symbol for transformation
function getTransformSymbol(transform) {
    switch (transform) {
        case 'log': return 'ln';
        case 'square': return 'sq';
        case 'sqrt': return '√';
        case 'inverse': return '1/';
        case 'cube': return 'cube';
        case 'boxcox': return 'BoxCox';
        default: return '';
    }
}