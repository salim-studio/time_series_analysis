// Chart utilities for creating various statistical visualizations
import { Chart, registerables } from 'chart.js';
import * as jstat from 'jstat';

// Register Chart.js components
Chart.register(...registerables);

// Create a violin plot
export function createViolinPlot(ctx, data, options = {}) {
    // Calculate kernel density estimation for violin
    const kde = calculateKDE(data);
    
    // Mirror the KDE for violin shape
    const leftSide = kde.map(point => ({ x: -point.y, y: point.x }));
    const rightSide = kde.map(point => ({ x: point.y, y: point.x }));
    
    // Combine into a single path
    const allPoints = [...leftSide.reverse(), ...rightSide];
    
    return new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: options.label || 'Violin Plot',
                data: allPoints,
                backgroundColor: options.color || 'rgba(54, 162, 235, 0.2)',
                borderColor: options.borderColor || 'rgba(54, 162, 235, 1)',
                borderWidth: 2,
                pointRadius: 0,
                showLine: true,
                fill: true
            }, {
                label: 'Data Points',
                data: data.map(d => ({ x: 0, y: d })),
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1,
                pointRadius: 3,
                pointStyle: 'circle'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: options.title || 'Violin Plot'
                }
            },
            scales: {
                x: {
                    title: {
                        display: false
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Value'
                    }
                }
            }
        }
    });
}

// Create a density plot
export function createDensityPlot(ctx, data, options = {}) {
    // Calculate kernel density estimation
    const kde = calculateKDE(data);
    
    return new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: options.label || 'Density',
                data: kde,
                backgroundColor: options.color || 'rgba(54, 162, 235, 0.2)',
                borderColor: options.borderColor || 'rgba(54, 162, 235, 1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: options.title || 'Density Plot'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Value'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Density'
                    }
                }
            }
        }
    });
}

// Create a histogram
export function createHistogram(ctx, data, options = {}) {
    // Calculate bins
    const { bins, counts } = calculateHistogramBins(data, options.bins || 10);
    
    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: bins.map((bin, i) => i === bins.length - 1 ? '' : bin.toFixed(2)),
            datasets: [{
                label: options.label || 'Frequency',
                data: counts,
                backgroundColor: options.color || 'rgba(54, 162, 235, 0.5)',
                borderColor: options.borderColor || 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Value'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Frequency'
                    },
                    beginAtZero: true
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: options.title || 'Histogram'
                }
            }
        }
    });
}

// Create a boxplot
export function createBoxPlot(ctx, data, options = {}) {
    // Calculate box plot statistics
    const stats = calculateBoxPlotStats(data);
    
    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [options.label || 'Box Plot'],
            datasets: [{
                label: 'Minimum to Maximum',
                data: [stats.max - stats.min],
                stack: 'stack',
                backgroundColor: 'rgba(0, 0, 0, 0)',
                borderColor: options.borderColor || 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                base: stats.min
            }, {
                label: 'Q1 to Q3',
                data: [stats.q3 - stats.q1],
                stack: 'stack',
                backgroundColor: options.color || 'rgba(54, 162, 235, 0.5)',
                borderColor: options.borderColor || 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                base: stats.q1
            }, {
                label: 'Median',
                data: [0.01], // Small value for visual representation
                stack: 'stack',
                backgroundColor: 'rgba(255, 99, 132, 1)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1,
                base: stats.median
            }, {
                label: 'Outliers',
                data: stats.outliers.map(() => 0),
                stack: 'stack',
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1,
                pointStyle: 'circle',
                pointRadius: 5,
                type: 'scatter',
                xAxisID: 'x'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Value'
                    }
                },
                y: {
                    title: {
                        display: false
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: options.title || 'Box Plot'
                },
                legend: {
                    display: false
                }
            }
        }
    });
}

// Create a heatmap
export function createHeatmap(ctx, data, options = {}) {
    // Expects data as a 2D array or matrix
    const rows = data.length;
    const cols = data[0].length;
    
    // Convert matrix to Chart.js format
    const datasets = [];
    for (let i = 0; i < rows; i++) {
        datasets.push({
            label: options.rowLabels ? options.rowLabels[i] : `Row ${i+1}`,
            data: data[i],
            backgroundColor: function(context) {
                const value = context.dataset.data[context.dataIndex];
                const min = options.min || Math.min(...data.flat());
                const max = options.max || Math.max(...data.flat());
                const normalized = (value - min) / (max - min) || 0;
                return getHeatmapColor(normalized);
            },
            borderColor: '#ffffff',
            borderWidth: 1
        });
    }
    
    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: options.colLabels || Array(cols).fill().map((_, i) => `Col ${i+1}`),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Variables'
                    }
                },
                y: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Variables'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: options.title || 'Heatmap'
                },
                legend: {
                    display: options.showLegend !== false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Value: ${context.raw}`;
                        }
                    }
                }
            }
        }
    });
}

// Create a correlogram (correlation matrix)
export function createCorrelogram(ctx, data, options = {}) {
    // Calculate correlation matrix
    const correlationMatrix = calculateCorrelationMatrix(data);
    const variables = options.variables || Array(data.length).fill().map((_, i) => `Var ${i+1}`);
    
    return createHeatmap(ctx, correlationMatrix, {
        title: 'Correlation Matrix',
        rowLabels: variables,
        colLabels: variables,
        min: -1,
        max: 1,
        xTitle: 'Variables',
        yTitle: 'Variables',
        showLegend: options.showLegend
    });
}

// Create a scatter plot
export function createScatterPlot(ctx, xData, yData, options = {}) {
    const data = xData.map((x, i) => ({ x, y: yData[i] }));
    
    return new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: options.label || 'Scatter Plot',
                data: data,
                backgroundColor: options.color || 'rgba(54, 162, 235, 0.5)',
                borderColor: options.borderColor || 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'X'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Y'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: options.title || 'Scatter Plot'
                }
            }
        }
    });
}

// Create a bar plot
export function createBarPlot(ctx, labels, values, options = {}) {
    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: options.label || 'Bar Plot',
                data: values,
                backgroundColor: options.color || 'rgba(54, 162, 235, 0.5)',
                borderColor: options.borderColor || 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Categories'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Values'
                    },
                    beginAtZero: true
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: options.title || 'Bar Plot'
                }
            }
        }
    });
}

// Create a line plot
export function createLinePlot(ctx, xData, yData, options = {}) {
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: xData,
            datasets: [{
                label: options.label || 'Line Plot',
                data: yData,
                backgroundColor: options.color || 'rgba(54, 162, 235, 0.2)',
                borderColor: options.borderColor || 'rgba(54, 162, 235, 1)',
                borderWidth: 2,
                tension: options.tension || 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'X'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Y'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: options.title || 'Line Plot'
                }
            }
        }
    });
}

// Create a QQ plot
export function createQQPlot(ctx, data, options = {}) {
    // Calculate theoretical quantiles (normal distribution)
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;
    
    const qqData = sorted.map((value, i) => {
        // Calculate empirical probability
        const p = (i + 0.5) / n;
        // Convert to standard normal quantile
        const z = jstat.normal.inv(p, 0, 1);
        return { x: z, y: value };
    });
    
    // Create reference line
    const min = Math.min(...qqData.map(d => d.x));
    const max = Math.max(...qqData.map(d => d.x));
    const mean = data.reduce((sum, val) => sum + val, 0) / n;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const sd = Math.sqrt(variance);
    
    const refLine = [
        { x: min, y: mean + sd * min },
        { x: max, y: mean + sd * max }
    ];
    
    return new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Data Points',
                data: qqData,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                pointRadius: 3
            }, {
                label: 'Reference Line',
                data: refLine,
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 2,
                pointRadius: 0,
                showLine: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Theoretical Quantiles'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Sample Quantiles'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: options.title || 'Q-Q Plot'
                }
            }
        }
    });
}

// Create a PP plot
export function createPPPlot(ctx, data, options = {}) {
    // Calculate empirical CDF vs theoretical CDF
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;
    
    // Calculate mean and standard deviation
    const mean = data.reduce((sum, val) => sum + val, 0) / n;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const sd = Math.sqrt(variance);
    
    const ppData = sorted.map((value, i) => {
        // Empirical probability
        const empirical = (i + 1) / n;
        // Theoretical probability (normal CDF)
        const z = (value - mean) / sd;
        const theoretical = jstat.normal.cdf(z, 0, 1);
        return { x: theoretical, y: empirical };
    });
    
    // Reference line (y = x)
    const refLine = [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
    ];
    
    return new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Data Points',
                data: ppData,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                pointRadius: 3
            }, {
                label: 'Reference Line',
                data: refLine,
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 2,
                pointRadius: 0,
                showLine: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Theoretical Probability'
                    },
                    min: 0,
                    max: 1
                },
                y: {
                    title: {
                        display: true,
                        text: 'Empirical Probability'
                    },
                    min: 0,
                    max: 1
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: options.title || 'P-P Plot'
                }
            }
        }
    });
}

// Create a logit plot
export function createLogitPlot(ctx, data, options = {}) {
    // Calculate empirical probabilities and logit transformation
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;
    
    const logitData = sorted.map((value, i) => {
        // Empirical probability (adjusted to avoid 0 and 1)
        const p = (i + 0.5) / (n + 1);
        // Logit transformation: ln(p/(1-p))
        const logit = Math.log(p / (1 - p));
        return { x: value, y: logit };
    });
    
    return new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Logit Transformed Data',
                data: logitData,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Value'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Logit(p)'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: options.title || 'Logit Plot'
                }
            }
        }
    });
}

// Create a probit plot
export function createProbitPlot(ctx, data, options = {}) {
    // Calculate empirical probabilities and probit transformation
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;
    
    const probitData = sorted.map((value, i) => {
        // Empirical probability (adjusted to avoid 0 and 1)
        const p = (i + 0.5) / (n + 1);
        // Probit transformation: inverse of standard normal CDF
        const probit = jstat.normal.inv(p, 0, 1);
        return { x: value, y: probit };
    });
    
    return new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Probit Transformed Data',
                data: probitData,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Value'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Probit(p)'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: options.title || 'Probit Plot'
                }
            }
        }
    });
}

// Helper function to calculate kernel density estimation
function calculateKDE(data, bandwidth = null) {
    // Sort data
    const sorted = [...data].sort((a, b) => a - b);
    
    // Use Silverman's rule of thumb for bandwidth if not provided
    if (!bandwidth) {
        const n = sorted.length;
        const std = Math.sqrt(sorted.reduce((sum, x) => sum + Math.pow(x - sorted.reduce((a, b) => a + b, 0) / n, 2), 0) / n);
        const iqr = sorted[Math.floor(0.75 * n)] - sorted[Math.floor(0.25 * n)];
        bandwidth = 0.9 * Math.min(std, iqr / 1.34) * Math.pow(n, -0.2);
    }
    
    // Generate points for KDE curve
    const min = sorted[0] - 2 * bandwidth;
    const max = sorted[sorted.length - 1] + 2 * bandwidth;
    const step = (max - min) / 100;
    
    const kde = [];
    for (let x = min; x <= max; x += step) {
        let sum = 0;
        for (let i = 0; i < sorted.length; i++) {
            // Gaussian kernel
            sum += Math.exp(-0.5 * Math.pow((x - sorted[i]) / bandwidth, 2)) / (bandwidth * Math.sqrt(2 * Math.PI));
        }
        sum /= sorted.length;
        kde.push({ x, y: sum });
    }
    
    return kde;
}

// Helper function to calculate histogram bins
function calculateHistogramBins(data, numBins = 10) {
    const sorted = [...data].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const range = max - min;
    const binWidth = range / numBins;
    
    // Create bins
    const bins = [];
    for (let i = 0; i <= numBins; i++) {
        bins.push(min + i * binWidth);
    }
    
    // Count values in each bin
    const counts = Array(numBins).fill(0);
    sorted.forEach(value => {
        // Find bin index (clamped to valid range)
        const binIndex = Math.min(Math.floor((value - min) / binWidth), numBins - 1);
        counts[binIndex]++;
    });
    
    return { bins, counts };
}

// Helper function to calculate box plot statistics
function calculateBoxPlotStats(data) {
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;
    
    const min = sorted[0];
    const max = sorted[n - 1];
    const q1 = sorted[Math.floor(n * 0.25)];
    const median = n % 2 === 0 
        ? (sorted[n/2 - 1] + sorted[n/2]) / 2
        : sorted[Math.floor(n/2)];
    const q3 = sorted[Math.floor(n * 0.75)];
    
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    
    // Find outliers
    const outliers = sorted.filter(value => value < lowerFence || value > upperFence);
    
    return { min, max, q1, median, q3, iqr, outliers };
}

// Helper function to calculate correlation matrix
function calculateCorrelationMatrix(data) {
    const n = data.length; // Number of variables
    const k = data[0].length; // Number of observations
    
    // Initialize correlation matrix
    const corrMatrix = Array(n).fill().map(() => Array(n).fill(0));
    
    // Calculate means
    const means = data.map(row => row.reduce((sum, val) => sum + val, 0) / k);
    
    // Calculate standard deviations
    const stdDevs = data.map((row, i) => 
        Math.sqrt(row.reduce((sum, val) => sum + Math.pow(val - means[i], 2), 0) / k)
    );
    
    // Calculate correlation coefficients
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i === j) {
                corrMatrix[i][j] = 1; // Diagonal is always 1
            } else {
                // Pearson correlation coefficient
                let numerator = 0;
                for (let obs = 0; obs < k; obs++) {
                    numerator += (data[i][obs] - means[i]) * (data[j][obs] - means[j]);
                }
                corrMatrix[i][j] = numerator / (k * stdDevs[i] * stdDevs[j]);
            }
        }
    }
    
    return corrMatrix;
}

// Helper function to get color for heatmap
function getHeatmapColor(value) {
    // Color gradient from blue (negative) to white (zero) to red (positive)
    if (value < 0.5) {
        // Blue to white
        const intensity = Math.round(255 * (1 - value * 2));
        return `rgba(${intensity}, ${intensity}, 255, 0.7)`;
    } else {
        // White to red
        const intensity = Math.round(255 * (1 - (value - 0.5) * 2));
        return `rgba(255, ${intensity}, ${intensity}, 0.7)`;
    }
}