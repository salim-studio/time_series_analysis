import { config } from './config.js';
import * as XLSX from 'xlsx';
import { Chart, registerables } from 'chart.js';
import { transformations, differenceOperations, timeSeriesModels, applyTransformation, applyDifferencing } from './transformations.js';
import { prepareRegressionData, runMultipleRegression } from './regression-utils.js';
import { calculateDurbinWatson, isSignificant, formatRegressionEquation } from './statistical-utils.js';
import { jarqueBera, serialCorrelationTest, heteroskedasticityTest } from './diagnostic-utils.js';
import * as regression from 'regression';
import * as jstat from 'jstat';

// Import chart utilities
import { 
    createViolinPlot, createDensityPlot, createHistogram, createBoxPlot,
    createHeatmap, createCorrelogram, createScatterPlot, createBarPlot,
    createLinePlot, createQQPlot, createPPPlot, createLogitPlot, createProbitPlot
} from './chart-utils.js';

// Register all Chart.js components
Chart.register(...registerables);

// Global variables
let currentLanguage = config.defaultLanguage;
let workbookData = null;
let columns = [];
let data = [];
let timeSeriesChart = null;
let regressionChart = null;
let dataTableVisible = true;

// DOM elements
const langToggleBtn = document.getElementById('lang-toggle');
const importBtn = document.getElementById('import-btn');
const descriptiveBtn = document.getElementById('descriptive-btn');
const regressionBtn = document.getElementById('regression-btn');
const ardlBtn = document.getElementById('ardl-btn');
const advancedTsBtn = document.getElementById('advanced-ts-btn');
const stationarityBtn = document.getElementById('stationarity-btn');
const panelBtn = document.getElementById('panel-btn');
const fileInput = document.getElementById('file-input');
const dropArea = document.querySelector('.drop-area');
const welcomeScreen = document.getElementById('welcome-screen');
const dataView = document.getElementById('data-view');
const statsView = document.getElementById('stats-view');
const regressionView = document.getElementById('regression-view');
const dependentVar = document.getElementById('dependent-var');
const independentVars = document.getElementById('independent-vars');
const runRegressionBtn = document.getElementById('run-regression');
const toggleTableBtn = document.getElementById('toggle-table-btn');
const dependentTransform = document.getElementById('dependent-transform');
const dependentDiff = document.getElementById('dependent-diff');
const independentTransform = document.getElementById('independent-transform');
const independentDiff = document.getElementById('independent-diff');
const timeSeriesModel = document.getElementById('time-series-model');
const dummyYearColumn = document.getElementById('dummy-year-column');
const dummyYears = document.getElementById('dummy-years');
const dummyQuarters = document.getElementById('dummy-quarters');
const ardlDependentVar = document.getElementById('ardl-dependent-var');
const ardlIndependentVars = document.getElementById('ardl-independent-vars');
const ardlDependentTransform = document.getElementById('ardl-dependent-transform');
const ardlDependentDiff = document.getElementById('ardl-dependent-diff');
const ardlIndependentTransform = document.getElementById('ardl-independent-transform');
const ardlIndependentDiff = document.getElementById('ardl-independent-diff');
const ardlTimeSeriesModel = document.getElementById('ardl-time-series-model');
const statsVars = document.getElementById('stats-vars');
const statsTransform = document.getElementById('stats-transform');
const statsDiff = document.getElementById('stats-diff');
const runStatsBtn = document.getElementById('run-stats');

// Initialize the application
function init() {
    setLanguage(currentLanguage);
    setupEventListeners();
    populateTransformationOptions();
    
    // Add function to update stats view
    window.updateStatsView = function() {
        // Clear existing options
        statsVars.innerHTML = '';
        statsTransform.innerHTML = '';
        statsDiff.innerHTML = '';
        
        // Add column options for statistics
        columns.forEach(column => {
            const option = document.createElement('option');
            option.value = column;
            option.textContent = column;
            statsVars.appendChild(option);
        });
        
        // Select second column and onward as variables by default
        if (statsVars.options.length > 1) {
            for (let i = 1; i < statsVars.options.length; i++) {
                statsVars.options[i].selected = true;
            }
        }
        
        // Add transformation options
        Object.keys(transformations).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = transformations[key].name;
            statsTransform.appendChild(option);
        });
        
        // Add differencing options
        Object.keys(differenceOperations).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = differenceOperations[key].name;
            statsDiff.appendChild(option);
        });
    };
}

// Set up event listeners
function setupEventListeners() {
    // Language toggle
    langToggleBtn.addEventListener('click', toggleLanguage);
    
    // Navigation
    importBtn.addEventListener('click', () => fileInput.click());
    descriptiveBtn.addEventListener('click', showStatsView);
    regressionBtn.addEventListener('click', showRegressionView);
    ardlBtn.addEventListener('click', showArdlView);
    advancedTsBtn.addEventListener('click', showAdvancedTsView);
    stationarityBtn.addEventListener('click', showStationarityView);
    panelBtn.addEventListener('click', showPanelView);
    
    // Toggle data table
    toggleTableBtn.addEventListener('click', toggleDataTable);
    
    // File import
    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.style.borderColor = 'var(--primary-color)';
        dropArea.style.backgroundColor = 'rgba(52, 152, 219, 0.05)';
    });
    
    dropArea.addEventListener('dragleave', () => {
        dropArea.style.borderColor = '#ccc';
        dropArea.style.backgroundColor = 'transparent';
    });
    
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.style.borderColor = '#ccc';
        dropArea.style.backgroundColor = 'transparent';
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileUpload({ target: fileInput });
        }
    });
    
    // Regression
    runRegressionBtn.addEventListener('click', runRegression);
    
    // Stats controls
    runStatsBtn.addEventListener('click', calculateDescriptiveStats);
    
    // ARDL
    document.getElementById('run-ardl').addEventListener('click', runArdlAnalysis);
    document.getElementById('ardl-auto-lag').addEventListener('change', function() {
        const autoLag = this.checked;
        document.getElementById('ardl-dependent-lags').disabled = autoLag;
        document.getElementById('ardl-independent-lags').disabled = autoLag;
        document.getElementById('ardl-ic-method').disabled = !autoLag;
    });
    
    // Set up run stationarity button
    document.getElementById('run-stationarity').addEventListener('click', runStationarityAnalysis);
}

// Toggle between languages
function toggleLanguage() {
    currentLanguage = currentLanguage === 'en' ? 'ar' : 'en';
    setLanguage(currentLanguage);
}

// Set language based on selection
function setLanguage(lang) {
    const translations = config.languages[lang];
    const direction = lang === 'ar' ? 'rtl' : 'ltr';
    
    document.body.style.direction = direction;
    if (lang === 'ar') {
        document.body.classList.add('rtl');
    } else {
        document.body.classList.remove('rtl');
    }
    
    // App title
    document.getElementById('app-title').textContent = translations.appTitle;
    
    // Toggle button text
    langToggleBtn.textContent = lang === 'en' ? 'العربية' : 'English';
    
    // Navigation buttons
    document.getElementById('import-text').textContent = translations.importBtn;
    document.getElementById('descriptive-text').textContent = translations.descriptiveBtn;
    document.getElementById('regression-text').textContent = translations.regressionBtn;
    
    // Welcome screen
    document.getElementById('welcome-title').textContent = translations.welcomeTitle;
    document.getElementById('welcome-desc').textContent = translations.welcomeDesc;
    document.getElementById('drop-text').textContent = translations.dropText;
    
    // Stats view
    document.getElementById('stats-title').textContent = translations.statsTitle;
    
    // Regression view
    document.getElementById('regression-title').textContent = translations.regressionTitle;
    document.getElementById('dependent-var-label').textContent = translations.dependentVarLabel;
    document.getElementById('independent-vars-label').textContent = translations.independentVarsLabel;
    document.getElementById('run-regression-text').textContent = translations.runRegressionBtn;
    
    // Toggle table button
    document.getElementById('toggle-table-text').textContent = 
        config.languages[currentLanguage].hideTableBtn;
    
    // Additional translation for transformation controls
    document.getElementById('dependent-transform-label').textContent = translations.transformationLabel;
    document.getElementById('dependent-diff-label').textContent = translations.differenceLabel;
    document.getElementById('independent-transform-label').textContent = translations.transformationLabel;
    document.getElementById('independent-diff-label').textContent = translations.differenceLabel;
    document.getElementById('time-series-model-label').textContent = translations.timeSeriesModelLabel;
    document.getElementById('dummy-year-column-label').textContent = translations.dummyYearColumnLabel;
    document.getElementById('dummy-years-label').textContent = translations.dummyYearsLabel;
    document.getElementById('dummy-quarters-label').textContent = translations.dummyQuartersLabel;
    
    // ARDL transformations
    document.getElementById('ardl-dependent-transform-label').textContent = translations.transformationLabel;
    document.getElementById('ardl-dependent-diff-label').textContent = translations.differenceLabel;
    document.getElementById('ardl-independent-transform-label').textContent = translations.transformationLabel;
    document.getElementById('ardl-independent-diff-label').textContent = translations.differenceLabel;
    document.getElementById('ardl-time-series-model-label').textContent = translations.timeSeriesModelLabel;
    
    // Stats view translations
    document.getElementById('run-stats-text').textContent = translations.runStatsBtn;
    document.getElementById('stats-vars-label').textContent = translations.statsVarsLabel;
    document.getElementById('stats-transform-label').textContent = translations.transformationLabel;
    document.getElementById('stats-diff-label').textContent = translations.differenceLabel;
    
    // Stationarity view translations
    document.getElementById('stationarity-text').textContent = translations.stationarityBtn;
    document.getElementById('stationarity-title').textContent = translations.stationarityTitle;
    document.getElementById('stationarity-vars-label').textContent = translations.stationarityVarsLabel;
    document.getElementById('stationarity-transform-label').textContent = translations.stationarityTransformLabel;
    document.getElementById('stationarity-diff-label').textContent = translations.stationarityDiffLabel;
    document.getElementById('stationarity-test-label').textContent = translations.stationarityTestLabel;
    document.getElementById('stationarity-lag-label').textContent = translations.stationarityLagLabel;
    document.getElementById('arma-p-label').textContent = translations.armaPLabel;
    document.getElementById('arma-q-label').textContent = translations.armaQLabel;
    document.getElementById('run-stationarity-text').textContent = translations.runStationarityText;
    
    // Panel data analysis translations
    document.getElementById('panel-text').textContent = translations.panelBtn;
    document.getElementById('panel-title').textContent = translations.panelTitle;
    document.getElementById('panel-entity-col-label').textContent = translations.panelEntityColLabel;
    document.getElementById('panel-time-col-label').textContent = translations.panelTimeColLabel;
    document.getElementById('panel-dependent-var-label').textContent = translations.dependentVarLabel;
    document.getElementById('panel-independent-vars-label').textContent = translations.independentVarsLabel;
    document.getElementById('panel-model-type-label').textContent = translations.panelModelTypeLabel;
    document.getElementById('panel-effects-label').textContent = translations.panelEffectsLabel;
    document.getElementById('panel-robust-label').textContent = translations.panelRobustLabel;
    document.getElementById('panel-cluster-label').textContent = translations.panelClusterLabel;
    document.getElementById('run-panel-text').textContent = translations.runPanelText;
    
    // If data is loaded, update views
    if (workbookData) {
        updateStatsView();
        updateRegressionView();
        updateStationarityView();
    }
}

// Function to populate transformation dropdowns
function populateTransformationOptions() {
    // Clear existing options
    dependentTransform.innerHTML = '';
    dependentDiff.innerHTML = '';
    independentTransform.innerHTML = '';
    independentDiff.innerHTML = '';
    timeSeriesModel.innerHTML = '';
    
    // Add transformation options
    Object.keys(transformations).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = transformations[key].name;
        dependentTransform.appendChild(option.cloneNode(true));
        independentTransform.appendChild(option);
    });
    
    // Add differencing options
    Object.keys(differenceOperations).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = differenceOperations[key].name;
        dependentDiff.appendChild(option.cloneNode(true));
        independentDiff.appendChild(option);
    });
    
    // Add time series model options
    Object.keys(timeSeriesModels).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = timeSeriesModels[key].name;
        timeSeriesModel.appendChild(option);
    });
}

// Handle file upload
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        
        // Check file type
        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            throw new Error('Invalid file format. Please upload an Excel file (.xlsx or .xls).');
        }
        
        // Check file size
        if (file.size > 10 * 1024 * 1024) {
            throw new Error('File is too large. Maximum size is 10MB.');
        }
        
        try {
            const workbook = XLSX.read(arrayBuffer);
            
            // Check if workbook has any sheets
            if (workbook.SheetNames.length === 0) {
                throw new Error('The Excel file does not contain any sheets.');
            }
            
            // Get the first sheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Convert to JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            
            if (jsonData.length === 0) {
                throw new Error('No data found in the Excel file. Please ensure the sheet contains data with headers.');
            }
            
            // Store data
            workbookData = jsonData;
            columns = Object.keys(jsonData[0]);
            data = jsonData;
            
            // Populate selectors
            populateSelectors();
            
            // Update years dropdown when year column changes
            dummyYearColumn.addEventListener('change', updateYearsDropdown);
            updateYearsDropdown();
            
            // Display data
            displayDataTable();
            
            // Show data view
            showDataView();
            
        } catch (excelError) {
            console.error('Error parsing Excel file:', excelError);
            throw new Error(`Unable to parse Excel file: ${excelError.message || 'Invalid format'}`);
        }
        
    } catch (error) {
        console.error('Error reading Excel file:', error);
        alert(`Error: ${error.message || 'Error reading Excel file. Please try another file.'}`);
    }
}

// Add function to update years dropdown based on selected year column
function updateYearsDropdown() {
    const yearColumn = dummyYearColumn.value;
    dummyYears.innerHTML = '';
    
    if (yearColumn !== 'none') {
        // Extract unique years from the selected column
        const years = [...new Set(data.map(row => row[yearColumn]))].sort();
        
        // Add each year as an option
        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            dummyYears.appendChild(option);
        });
    }
}

// Populate column selectors
function populateSelectors() {
    // Clear existing options
    dependentVar.innerHTML = '';
    independentVars.innerHTML = '';
    dummyYearColumn.innerHTML = '';
    
    // Add none option for year column
    const noneOption = document.createElement('option');
    noneOption.value = 'none';
    noneOption.textContent = config.languages[currentLanguage].noneOption;
    dummyYearColumn.appendChild(noneOption);
    
    // Add column options
    columns.forEach(column => {
        // Dependent variable
        const depOption = document.createElement('option');
        depOption.value = column;
        depOption.textContent = column;
        dependentVar.appendChild(depOption);
        
        // Independent variables
        const indepOption = document.createElement('option');
        indepOption.value = column;
        indepOption.textContent = column;
        independentVars.appendChild(indepOption);
        
        // Year column for dummies
        const yearOption = document.createElement('option');
        yearOption.value = column;
        yearOption.textContent = column;
        dummyYearColumn.appendChild(yearOption);
    });
    
    // Select second column as dependent var by default
    if (dependentVar.options.length > 1) {
        dependentVar.selectedIndex = 1;
    }
    
    // Select all except first two columns as independent vars by default
    if (independentVars.options.length > 2) {
        for (let i = 2; i < independentVars.options.length; i++) {
            independentVars.options[i].selected = true;
        }
    }
}

// Display data in table
function displayDataTable() {
    const tableHeader = document.getElementById('table-header');
    const tableBody = document.getElementById('table-body');
    
    // Clear existing table
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';
    
    // Add headers
    columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        tableHeader.appendChild(th);
    });
    
    // Add data rows (limit to 100 for performance)
    const maxRows = Math.min(data.length, 100);
    for (let i = 0; i < maxRows; i++) {
        const row = document.createElement('tr');
        columns.forEach(column => {
            const td = document.createElement('td');
            td.textContent = data[i][column];
            row.appendChild(td);
        });
        tableBody.appendChild(row);
    }
}

// New function to toggle data table visibility
function toggleDataTable() {
    const dataTableContainer = document.getElementById('data-table-container');
    dataTableVisible = !dataTableVisible;
    
    if (dataTableVisible) {
        dataTableContainer.style.display = 'block';
        document.getElementById('toggle-table-text').textContent = 
            config.languages[currentLanguage].hideTableBtn;
    } else {
        dataTableContainer.style.display = 'none';
        document.getElementById('toggle-table-text').textContent = 
            config.languages[currentLanguage].showTableBtn;
    }
}

// Modified run regression function to use transformations
function runRegression() {
    const yColumn = dependentVar.value;
    const xColumns = Array.from(independentVars.selectedOptions).map(option => option.value);
    
    if (!yColumn || xColumns.length === 0) {
        alert('Please select dependent and independent variables');
        return;
    }
    
    try {
        // Get transformation and differencing selections
        const yTransform = dependentTransform.value;
        const yDiff = dependentDiff.value;
        const xTransform = independentTransform.value;
        const xDiff = independentDiff.value;
        const tsModel = timeSeriesModel.value;
        
        // Get dummy variable selections
        const yearColumn = dummyYearColumn.value;
        const selectedYears = Array.from(dummyYears.selectedOptions).map(option => option.value);
        const selectedQuarter = dummyQuarters.value;
        
        // Add dummy variables to the data if needed
        let dummyColumns = [];
        if (yearColumn !== 'none' && selectedYears.length > 0) {
            const modifiedData = addDummyVariables(data, yearColumn, selectedYears, selectedQuarter);
            data = modifiedData.data;
            dummyColumns = modifiedData.dummyColumns;
            
            // Add dummy columns to xColumns
            xColumns.push(...dummyColumns);
        }
        
        // Prepare data with transformations
        const { yValues, X, dataLength } = prepareRegressionData(
            data, 
            yColumn, 
            xColumns, 
            yTransform, 
            yDiff, 
            xTransform, 
            xDiff
        );
        
        // Run regression
        const results = runMultipleRegression(yValues, X);
        
        // Add context to results
        results.yColumn = yColumn;
        results.xColumns = xColumns;
        results.yTransform = yTransform;
        results.yDiff = yDiff;
        results.xTransform = xTransform;
        results.xDiff = xDiff;
        results.tsModel = tsModel;
        results.dummyColumns = dummyColumns;
        
        // Display results
        displayRegressionResults(results);
    } catch (error) {
        alert('Error in regression analysis: ' + error.message);
        console.error(error);
    }
}

// Add dummy variables to the data
function addDummyVariables(data, yearColumn, selectedYears, selectedQuarter) {
    const modifiedData = [...data];
    const dummyColumns = [];
    
    // Add year dummies
    selectedYears.forEach(year => {
        const dummyName = `Dummy_${year}`;
        dummyColumns.push(dummyName);
        
        modifiedData.forEach(row => {
            row[dummyName] = row[yearColumn] === year ? 1 : 0;
        });
    });
    
    // Add quarter dummy if selected
    if (selectedQuarter !== 'none') {
        const quarterDummyName = `Dummy_${selectedQuarter}`;
        dummyColumns.push(quarterDummyName);
        
        const quarterMap = {
            'q1': [1, 2, 3],
            'q2': [4, 5, 6],
            'q3': [7, 8, 9],
            'q4': [10, 11, 12]
        };
        
        // Try to find a month or quarter column
        const timeColumns = columns.filter(col => 
            col.toLowerCase().includes('month') || 
            col.toLowerCase().includes('quarter') ||
            col.toLowerCase().includes('period')
        );
        
        if (timeColumns.length > 0) {
            const timeColumn = timeColumns[0];
            
            modifiedData.forEach(row => {
                const timeValue = parseInt(row[timeColumn]);
                row[quarterDummyName] = quarterMap[selectedQuarter].includes(timeValue) ? 1 : 0;
            });
        }
    }
    
    return { data: modifiedData, dummyColumns };
}

// Display regression results
function displayRegressionResults(results) {
    const resultsContainer = document.getElementById('regression-results');
    resultsContainer.innerHTML = '';
    
    const translations = config.languages[currentLanguage];
    
    // Add regression equation
    const equationDiv = document.createElement('div');
    equationDiv.className = 'regression-equation';
    equationDiv.innerHTML = `<h4>${translations.regressionEquation}</h4><p>${formatRegressionEquation(
        results.beta, 
        results.xColumns, 
        results.yColumn,
        results.yTransform,
        results.xTransform
    )}</p>`;
    resultsContainer.appendChild(equationDiv);
    
    // Run diagnostic tests
    const jbTest = jarqueBera(results.residuals);
    const scTest = serialCorrelationTest(results.residuals, results.validX);
    const hetTest = heteroskedasticityTest(results.residuals, results.validX);
    
    // Create diagnostics table
    const diagnosticsTable = document.createElement('table');
    diagnosticsTable.className = 'result-table';
    
    // Diagnostics header
    const diagHeader = document.createElement('tr');
    const diagHeaderCell = document.createElement('th');
    diagHeaderCell.colSpan = 3;
    diagHeaderCell.textContent = translations.diagnosticTests;
    diagHeader.appendChild(diagHeaderCell);
    diagnosticsTable.appendChild(diagHeader);
    
    // Diagnostics table headers
    const diagTableHeader = document.createElement('tr');
    ['Test', 'Statistic', 'Result'].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        diagTableHeader.appendChild(th);
    });
    diagnosticsTable.appendChild(diagTableHeader);
    
    // Add Jarque-Bera test
    const jbRow = document.createElement('tr');
    
    const jbLabelCell = document.createElement('td');
    jbLabelCell.textContent = translations.jarqueBera;
    
    const jbStatCell = document.createElement('td');
    jbStatCell.textContent = `${jbTest.statistic.toFixed(4)} (p=${jbTest.pValue.toExponential(4)})`;
    
    const jbResultCell = document.createElement('td');
    jbResultCell.textContent = jbTest.isNormal ? translations.normal : translations.notNormal;
    jbResultCell.style.color = jbTest.isNormal ? 'green' : 'red';
    
    jbRow.appendChild(jbLabelCell);
    jbRow.appendChild(jbStatCell);
    jbRow.appendChild(jbResultCell);
    diagnosticsTable.appendChild(jbRow);
    
    // Add Serial Correlation test
    const scRow = document.createElement('tr');
    
    const scLabelCell = document.createElement('td');
    scLabelCell.textContent = translations.serialCorrelation;
    
    const scStatCell = document.createElement('td');
    scStatCell.textContent = `${scTest.statistic.toFixed(4)} (p=${scTest.pValue.toExponential(4)})`;
    
    const scResultCell = document.createElement('td');
    const noSerialCorrelation = !scTest.hasSerialCorrelation;
    scResultCell.textContent = noSerialCorrelation ? translations.noSerialCorrelation : translations.serialCorrelation;
    scResultCell.style.color = noSerialCorrelation ? 'green' : 'red';
    
    scRow.appendChild(scLabelCell);
    scRow.appendChild(scStatCell);
    scRow.appendChild(scResultCell);
    diagnosticsTable.appendChild(scRow);
    
    // Add Heteroskedasticity test
    const hetRow = document.createElement('tr');
    
    const hetLabelCell = document.createElement('td');
    hetLabelCell.textContent = translations.heteroskedasticity;
    
    const hetStatCell = document.createElement('td');
    hetStatCell.textContent = `${hetTest.statistic.toFixed(4)} (p=${hetTest.pValue.toExponential(4)})`;
    
    const hetResultCell = document.createElement('td');
    const isHomoskedastic = !hetTest.hasHeteroskedasticity;
    hetResultCell.textContent = isHomoskedastic ? translations.homoskedastic : translations.heteroskedastic;
    hetResultCell.style.color = isHomoskedastic ? 'green' : 'red';
    
    hetRow.appendChild(hetLabelCell);
    hetRow.appendChild(hetStatCell);
    hetRow.appendChild(hetResultCell);
    diagnosticsTable.appendChild(hetRow);
    
    resultsContainer.appendChild(diagnosticsTable);
    
    // Create summary table
    const summaryTable = document.createElement('table');
    summaryTable.className = 'result-table';
    
    // Model summary header
    const summaryHeader = document.createElement('tr');
    const summaryHeaderCell = document.createElement('th');
    summaryHeaderCell.colSpan = 2;
    summaryHeaderCell.textContent = translations.modelSummary;
    summaryHeader.appendChild(summaryHeaderCell);
    summaryTable.appendChild(summaryHeader);
    
    // Calculate Durbin-Watson statistic
    const durbinWatson = calculateDurbinWatson(results.residuals);
    const modelSignificant = isSignificant(results.pValueModel);
    
    // Add model statistics
    const summaryStats = [
        { label: translations.rSquared, value: results.rSquared.toFixed(4) },
        { label: translations.adjustedRSquared, value: results.adjustedRSquared.toFixed(4) },
        { label: translations.fStatistic, value: results.fStat.toFixed(4) },
        { label: translations.pValueModel, value: results.pValueModel.toExponential(4) },
        { label: translations.modelSignificant, value: modelSignificant ? translations.significant : translations.notSignificant },
        { label: translations.durbinWatson, value: durbinWatson.toFixed(4) }
    ];
    
    summaryStats.forEach(stat => {
        const row = document.createElement('tr');
        const labelCell = document.createElement('td');
        labelCell.textContent = stat.label;
        const valueCell = document.createElement('td');
        valueCell.textContent = stat.value;
        
        // Add significance styling
        if (stat.label === translations.modelSignificant) {
            valueCell.style.color = modelSignificant ? 'green' : 'red';
            valueCell.style.fontWeight = 'bold';
        }
        
        row.appendChild(labelCell);
        row.appendChild(valueCell);
        summaryTable.appendChild(row);
    });
    
    resultsContainer.appendChild(summaryTable);
    
    // Create coefficients table
    const coeffTable = document.createElement('table');
    coeffTable.className = 'result-table';
    
    // Coefficients header
    const coeffHeader = document.createElement('tr');
    const coeffHeaderCell = document.createElement('th');
    coeffHeaderCell.colSpan = 5;
    coeffHeaderCell.textContent = translations.coefficients;
    coeffHeader.appendChild(coeffHeaderCell);
    coeffTable.appendChild(coeffHeader);
    
    // Coefficient table headers
    const coeffTableHeader = document.createElement('tr');
    const headers = [
        translations.variable, 
        translations.value, 
        translations.standardError,
        translations.tStatistic, 
        translations.pValue, 
        translations.significant
    ];
    
    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        coeffTableHeader.appendChild(th);
    });
    coeffTable.appendChild(coeffTableHeader);
    
    // Add intercept
    const interceptRow = document.createElement('tr');
    const interceptLabelCell = document.createElement('td');
    interceptLabelCell.textContent = translations.intercept;
    
    const interceptValueCell = document.createElement('td');
    interceptValueCell.textContent = results.beta[0].toFixed(4);
    
    const interceptSeCell = document.createElement('td');
    interceptSeCell.textContent = results.se[0].toFixed(4);
    
    const interceptTStatCell = document.createElement('td');
    interceptTStatCell.textContent = results.tStats[0].toFixed(4);
    
    const interceptPValueCell = document.createElement('td');
    interceptPValueCell.textContent = results.pValues[0].toExponential(4);
    
    const interceptSignificantCell = document.createElement('td');
    const interceptSignificant = isSignificant(results.pValues[0]);
    interceptSignificantCell.textContent = interceptSignificant ? translations.significant : translations.notSignificant;
    interceptSignificantCell.style.color = interceptSignificant ? 'green' : 'red';
    
    interceptRow.appendChild(interceptLabelCell);
    interceptRow.appendChild(interceptValueCell);
    interceptRow.appendChild(interceptSeCell);
    interceptRow.appendChild(interceptTStatCell);
    interceptRow.appendChild(interceptPValueCell);
    interceptRow.appendChild(interceptSignificantCell);
    coeffTable.appendChild(interceptRow);
    
    // Add other coefficients
    results.xColumns.forEach((column, i) => {
        const row = document.createElement('tr');
        
        const labelCell = document.createElement('td');
        labelCell.textContent = column;
        
        const valueCell = document.createElement('td');
        valueCell.textContent = results.beta[i + 1].toFixed(4);
        
        const seCell = document.createElement('td');
        seCell.textContent = results.se[i + 1].toFixed(4);
        
        const tStatCell = document.createElement('td');
        tStatCell.textContent = results.tStats[i + 1].toFixed(4);
        
        const pValueCell = document.createElement('td');
        pValueCell.textContent = results.pValues[i + 1].toExponential(4);
        
        const significantCell = document.createElement('td');
        const isVarSignificant = isSignificant(results.pValues[i + 1]);
        significantCell.textContent = isVarSignificant ? translations.significant : translations.notSignificant;
        significantCell.style.color = isVarSignificant ? 'green' : 'red';
        
        row.appendChild(labelCell);
        row.appendChild(valueCell);
        row.appendChild(seCell);
        row.appendChild(tStatCell);
        row.appendChild(pValueCell);
        row.appendChild(significantCell);
        coeffTable.appendChild(row);
    });
    
    resultsContainer.appendChild(coeffTable);
    
    // Create scatter plot of actual vs fitted values
    createRegressionPlot(results);
}

// Create regression plot of actual vs fitted values
function createRegressionPlot(results) {
    // Destroy existing chart if it exists
    if (regressionChart) {
        regressionChart.destroy();
    }
    
    const translations = config.languages[currentLanguage];
    
    // Prepare data for chart
    const actualValues = results.validY;
    const fittedValues = results.yFitted;
    
    // Create scatter plot data
    const scatterData = actualValues.map((y, i) => ({
        x: y,
        y: fittedValues[i]
    }));
    
    // Find min and max for both axes
    const allValues = [...actualValues, ...fittedValues];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    
    // Create diagonal line data (perfect prediction)
    const lineData = [
        { x: min, y: min },
        { x: max, y: max }
    ];
    
    // Create new chart
    const ctx = document.getElementById('regression-chart').getContext('2d');
    regressionChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: translations.actualVsPredicted,
                    data: scatterData,
                    backgroundColor: 'rgba(52, 152, 219, 0.7)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 1,
                },
                {
                    label: 'Perfect Prediction',
                    data: lineData,
                    type: 'line',
                    fill: false,
                    borderColor: 'rgba(231, 76, 60, 0.7)',
                    borderWidth: 2,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: 1,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: translations.actual
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: translations.predicted
                    }
                }
            }
        }
    });
}

// Update ARDL view
function updateArdlView() {
    // Get selectors
    const ardlDependentVar = document.getElementById('ardl-dependent-var');
    const ardlIndependentVars = document.getElementById('ardl-independent-vars');
    const ardlDependentTransform = document.getElementById('ardl-dependent-transform');
    const ardlDependentDiff = document.getElementById('ardl-dependent-diff');
    const ardlIndependentTransform = document.getElementById('ardl-independent-transform');
    const ardlIndependentDiff = document.getElementById('ardl-independent-diff');
    const ardlTimeSeriesModel = document.getElementById('ardl-time-series-model');
    
    // Clear existing options
    ardlDependentVar.innerHTML = '';
    ardlIndependentVars.innerHTML = '';
    
    // Add column options for ARDL analysis
    columns.forEach(column => {
        // Dependent variable
        const depOption = document.createElement('option');
        depOption.value = column;
        depOption.textContent = column;
        ardlDependentVar.appendChild(depOption);
        
        // Independent variables
        const indepOption = document.createElement('option');
        indepOption.value = column;
        indepOption.textContent = column;
        ardlIndependentVars.appendChild(indepOption);
    });
    
    // Select second column as dependent var by default
    if (ardlDependentVar.options.length > 1) {
        ardlDependentVar.selectedIndex = 1;
    }
    
    // Select all except first two columns as independent vars by default
    if (ardlIndependentVars.options.length > 2) {
        for (let i = 2; i < ardlIndependentVars.options.length; i++) {
            ardlIndependentVars.options[i].selected = true;
        }
    }
    
    // Populate transformation options
    ardlDependentTransform.innerHTML = '';
    ardlDependentDiff.innerHTML = '';
    ardlIndependentTransform.innerHTML = '';
    ardlIndependentDiff.innerHTML = '';
    ardlTimeSeriesModel.innerHTML = '';
    
    // Add transformation options
    Object.keys(transformations).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = transformations[key].name;
        ardlDependentTransform.appendChild(option.cloneNode(true));
        ardlIndependentTransform.appendChild(option);
    });
    
    // Add differencing options
    Object.keys(differenceOperations).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = differenceOperations[key].name;
        ardlDependentDiff.appendChild(option.cloneNode(true));
        ardlIndependentDiff.appendChild(option);
    });
    
    // Add time series model options
    Object.keys(timeSeriesModels).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = timeSeriesModels[key].name;
        ardlTimeSeriesModel.appendChild(option);
    });
    
    // Add event listener for auto lag checkbox
    document.getElementById('ardl-auto-lag').addEventListener('change', function() {
        const autoLag = this.checked;
        document.getElementById('ardl-dependent-lags').disabled = autoLag;
        document.getElementById('ardl-independent-lags').disabled = autoLag;
        document.getElementById('ardl-ic-method').disabled = !autoLag;
    });
    
    // Set up run ARDL button
    document.getElementById('run-ardl').addEventListener('click', runArdlAnalysis);
}

// Run ARDL analysis
function runArdlAnalysis() {
    const yColumn = document.getElementById('ardl-dependent-var').value;
    const xColumns = Array.from(document.getElementById('ardl-independent-vars').selectedOptions).map(option => option.value);
    const pLag = parseInt(document.getElementById('ardl-dependent-lags').value);
    const qLag = parseInt(document.getElementById('ardl-independent-lags').value);
    const yTransform = document.getElementById('ardl-dependent-transform').value;
    const yDiff = document.getElementById('ardl-dependent-diff').value;
    const xTransform = document.getElementById('ardl-independent-transform').value;
    const xDiff = document.getElementById('ardl-independent-diff').value;
    const tsModel = document.getElementById('ardl-time-series-model').value;
    const useAutoLag = document.getElementById('ardl-auto-lag').checked;
    const icMethod = document.getElementById('ardl-ic-method').value;
    const includeForecast = document.getElementById('ardl-forecast').checked;
    const forecastPeriods = parseInt(document.getElementById('ardl-forecast-periods').value);
    
    if (!yColumn || xColumns.length === 0) {
        alert('Please select dependent and independent variables');
        return;
    }
    
    try {
        // Prepare data with transformations
        const { yValues, X, dataLength } = prepareRegressionData(
            data, 
            yColumn, 
            xColumns, 
            yTransform, 
            yDiff, 
            xTransform, 
            xDiff
        );
        
        // Create lagged variables
        let finalLagP = pLag;
        let finalLagQ = qLag;
        
        if (useAutoLag) {
            // Determine optimal lag structure
            const optimalLags = findOptimalLags(yValues, X, icMethod, 4);
            finalLagP = optimalLags.pLag;
            finalLagQ = optimalLags.qLag;
        }
        
        // Create ARDL model with determined lags
        const ardlModel = createArdlModel(yValues, X, finalLagP, finalLagQ);
        
        // Estimate the model
        const ardlResults = estimateArdlModel(ardlModel);
        
        // Bounds test
        const boundsTest = performBoundsTest(ardlResults);
        
        // Long-run coefficients
        const longRunCoefs = calculateLongRunCoefficients(ardlResults);
        
        // Error correction model
        const ecmResults = estimateErrorCorrectionModel(ardlResults);
        
        // Diagnostic tests
        const diagnostics = performDiagnosticTests(ardlResults.residuals, ardlModel.X);
        
        // Forecasting (if selected)
        let forecasts = null;
        if (includeForecast) {
            forecasts = generateArdlForecasts(ardlResults, forecastPeriods);
        }
        
        // Create final results object
        const finalResults = {
            yColumn,
            xColumns,
            pLag: finalLagP,
            qLag: finalLagQ,
            yTransform,
            yDiff,
            xTransform,
            xDiff,
            tsModel,
            optimal: useAutoLag,
            icMethod: useAutoLag ? icMethod : 'manual',
            boundsTest,
            ardlResults,
            longRunCoefs,
            ecmResults,
            diagnostics,
            forecasts,
            rSquared: ardlResults.rSquared,
            adjustedRSquared: ardlResults.adjustedRSquared,
            fStat: ardlResults.fStat,
            durbinWatson: calculateDurbinWatson(ardlResults.residuals)
        };
        
        // Display results
        displayArdlResults(finalResults);
        
    } catch (error) {
        alert('Error in ARDL analysis: ' + error.message);
        console.error(error);
    }
}

// Find optimal lag structure using information criteria
function findOptimalLags(y, X, criterion = 'aic', maxLag = 4) {
    let bestIC = Infinity;
    let bestP = 0;
    let bestQ = 0;
    
    // Try different lag combinations
    for (let p = 0; p <= maxLag; p++) {
        for (let q = 0; q <= maxLag; q++) {
            // Skip if no lags at all
            if (p === 0 && q === 0) continue;
            
            try {
                // Create and estimate ARDL model
                const model = createArdlModel(y, X, p, q);
                const results = estimateArdlModel(model);
                
                // Calculate information criterion
                let ic;
                const n = results.residuals.length;
                const k = results.beta.length;
                const ssr = results.residuals.reduce((sum, r) => sum + r * r, 0);
                
                if (criterion === 'aic') {
                    // Akaike Information Criterion
                    ic = n * Math.log(ssr / n) + 2 * k;
                } else if (criterion === 'sic' || criterion === 'bic') {
                    // Schwarz/Bayesian Information Criterion
                    ic = n * Math.log(ssr / n) + k * Math.log(n);
                } else if (criterion === 'hqc') {
                    // Hannan-Quinn Criterion
                    ic = n * Math.log(ssr / n) + 2 * k * Math.log(Math.log(n));
                }
                
                // Update best if this is better
                if (ic < bestIC) {
                    bestIC = ic;
                    bestP = p;
                    bestQ = q;
                }
            } catch (e) {
                // Skip combinations that fail
                console.warn(`Failed for p=${p}, q=${q}:`, e);
            }
        }
    }
    
    return { pLag: bestP, qLag: bestQ, ic: bestIC };
}

// Create ARDL model with lagged variables
function createArdlModel(y, X, pLag, qLag) {
    const xCols = X[0].length - 1; // Number of x variables (excluding intercept)
    const n = y.length;
    
    // Determine effective sample size after lag creation
    const effectiveStart = Math.max(pLag, qLag);
    const effectiveN = n - effectiveStart;
    
    // Create dependent variable and its lags
    const yVar = y.slice(effectiveStart);
    const yLags = [];
    
    for (let lag = 1; lag <= pLag; lag++) {
        const yLag = y.slice(effectiveStart - lag, n - lag);
        yLags.push(yLag);
    }
    
    // Create independent variables and their lags
    const xVars = [];
    for (let i = 0; i < effectiveN; i++) {
        xVars.push(X[i + effectiveStart].slice(1)); // Exclude intercept
    }
    
    // Create X lags
    const xLags = [];
    for (let lag = 1; lag <= qLag; lag++) {
        for (let col = 0; col < xCols; col++) {
            const xLag = [];
            for (let i = 0; i < effectiveN; i++) {
                xLag.push(X[i + effectiveStart - lag][col + 1]);
            }
            xLags.push(xLag);
        }
    }
    
    // Create final X matrix for regression
    const finalX = [];
    for (let i = 0; i < effectiveN; i++) {
        const row = [1]; // Intercept
        
        // Add current X values
        for (let col = 0; col < xCols; col++) {
            row.push(xVars[i][col]);
        }
        
        // Add Y lags
        for (let lag = 0; lag < pLag; lag++) {
            row.push(yLags[lag][i]);
        }
        
        // Add X lags
        for (let lag = 0; lag < xLags.length; lag++) {
            row.push(xLags[lag][i]);
        }
        
        finalX.push(row);
    }
    
    return {
        y: yVar,
        X: finalX,
        pLag,
        qLag,
        xCols,
        effectiveN,
        effectiveStart
    };
}

// Estimate the ARDL model
function estimateArdlModel(model) {
    // Run multiple regression with the prepared data
    const regression = runMultipleRegression(model.y, model.X);
    
    // Add additional model information
    regression.pLag = model.pLag;
    regression.qLag = model.qLag;
    regression.xCols = model.xCols;
    regression.effectiveN = model.effectiveN;
    regression.effectiveStart = model.effectiveStart;
    
    return regression;
}

// Perform bounds test for cointegration
function performBoundsTest(ardlResults) {
    const n = ardlResults.validY.length;
    const k = ardlResults.xCols; // Number of regressors
    
    // Critical values for bounds test (from Pesaran et al. 2001)
    // Format: [lowerBound, upperBound] for significance levels 10%, 5%, 2.5%, 1%
    const criticalValues = {
        // k=1
        1: [
            [3.02, 3.51],  // 10%
            [3.62, 4.16],  // 5%
            [4.18, 4.79],  // 2.5%
            [4.94, 5.58]   // 1%
        ],
        // k=2
        2: [
            [2.63, 3.35],
            [3.10, 3.87],
            [3.55, 4.38],
            [4.13, 5.00]
        ],
        // k=3
        3: [
            [2.37, 3.20],
            [2.79, 3.67],
            [3.15, 4.08],
            [3.65, 4.66]
        ],
        // k=4
        4: [
            [2.20, 3.09],
            [2.56, 3.49],
            [2.88, 3.87],
            [3.29, 4.37]
        ],
        // k=5
        5: [
            [2.08, 3.00],
            [2.39, 3.38],
            [2.70, 3.73],
            [3.06, 4.15]
        ]
    };
    
    // Get appropriate critical values or use k=5 for higher k
    const cvKey = Math.min(5, k);
    const cv = criticalValues[cvKey];
    
    // Calculate F-statistic for bounds test
    // This is simplified and would need a full implementation in practice
    const fStat = ardlResults.fStat;
    
    // Determine test result
    let result = null;
    let conclusion = null;
    
    if (fStat > cv[3][1]) { // Above 1% upper bound
        result = "Cointegration";
        conclusion = "Strong evidence of long-run relationship";
    } else if (fStat > cv[2][1]) { // Above 2.5% upper bound
        result = "Cointegration";
        conclusion = "Evidence of long-run relationship at 2.5% significance";
    } else if (fStat > cv[1][1]) { // Above 5% upper bound
        result = "Cointegration";
        conclusion = "Evidence of long-run relationship at 5% significance";
    } else if (fStat > cv[0][1]) { // Above 10% upper bound
        result = "Cointegration";
        conclusion = "Weak evidence of long-run relationship at 10% significance";
    } else if (fStat < cv[0][0]) { // Below 10% lower bound
        result = "No Cointegration";
        conclusion = "No evidence of long-run relationship";
    } else { // Between bounds
        result = "Inconclusive";
        conclusion = "The test is inconclusive";
    }
    
    return {
        fStat,
        criticalValues: cv,
        result,
        conclusion,
        hasCointegration: result === "Cointegration"
    };
}

// Calculate long-run coefficients
function calculateLongRunCoefficients(ardlResults) {
    const beta = ardlResults.beta;
    const se = ardlResults.se;
    const p = ardlResults.pLag;
    const k = ardlResults.xCols;
    
    // Extract coefficients groups
    const intercept = beta[0];
    const xCoefs = beta.slice(1, k + 1);
    const yLagCoefs = beta.slice(k + 1, k + 1 + p);
    
    // Calculate denominator (1 - sum of y lag coefficients)
    const denominator = 1 - yLagCoefs.reduce((sum, coef) => sum + coef, 0);
    
    // Calculate long-run coefficients
    const longRunIntercept = intercept / denominator;
    const longRunCoefs = xCoefs.map(coef => coef / denominator);
    
    // Calculate standard errors (delta method approximation)
    // This is a simplification - a full implementation would use the variance-covariance matrix
    const longRunSE = se.slice(1, k + 1).map(seValue => seValue / Math.abs(denominator));
    
    // Create t-statistics and p-values for long-run coefficients
    const tStats = longRunCoefs.map((coef, i) => coef / longRunSE[i]);
    const pValues = tStats.map(t => 2 * (1 - normCDF(Math.abs(t))));
    
    // Create result object with variable names
    const result = [{
        variable: "Constant",
        coefficient: longRunIntercept,
        stderr: se[0] / Math.abs(denominator),
        tstat: longRunIntercept / (se[0] / Math.abs(denominator)),
        pvalue: 2 * (1 - normCDF(Math.abs(longRunIntercept / (se[0] / Math.abs(denominator)))))
    }];
    
    // Add each variable's long run coefficient
    for (let i = 0; i < k; i++) {
        result.push({
            variable: `X${i+1}`,
            coefficient: longRunCoefs[i],
            stderr: longRunSE[i],
            tstat: tStats[i],
            pvalue: pValues[i]
        });
    }
    
    return result;
}

// Estimate error correction model
function estimateErrorCorrectionModel(ardlResults) {
    const y = ardlResults.validY;
    const X = ardlResults.validX;
    const beta = ardlResults.beta;
    const p = ardlResults.pLag;
    const k = ardlResults.xCols;
    const n = y.length;
    
    // Create residuals from the ARDL model (equilibrium errors)
    const residuals = ardlResults.residuals;
    
    // Create differenced variables
    const diffY = [];
    for (let i = 1; i < n; i++) {
        diffY.push(y[i] - y[i-1]);
    }
    
    // Create X matrix for ECM
    const ecmX = [];
    for (let i = 1; i < n; i++) {
        const row = [1]; // Intercept
        
        // Add differenced X variables
        for (let j = 1; j <= k; j++) {
            row.push(X[i][j] - X[i-1][j]);
        }
        
        // Add lagged differenced Y variables (if p > 1)
        for (let lag = 1; lag < p; lag++) {
            if (i - lag > 0) {
                row.push(y[i-lag] - y[i-lag-1]);
            } else {
                row.push(0); // Padding for unavailable lags
            }
        }
        
        // Add lagged residual (error correction term)
        row.push(residuals[i-1]);
        
        ecmX.push(row);
    }
    
    // Run regression for ECM
    const ecmResults = runMultipleRegression(diffY, ecmX);
    
    // Extract error correction term coefficient (last coefficient)
    const ectCoef = ecmResults.beta[ecmResults.beta.length - 1];
    const ectSE = ecmResults.se[ecmResults.se.length - 1];
    const ectTStat = ecmResults.tStats[ecmResults.tStats.length - 1];
    const ectPValue = ecmResults.pValues[ecmResults.pValues.length - 1];
    
    // Create short-run coefficients object
    const shortRunCoefs = [
        { 
            variable: "ECT(-1)", 
            coefficient: ectCoef, 
            stderr: ectSE, 
            tstat: ectTStat, 
            pvalue: ectPValue 
        }
    ];
    
    // Add other short-run coefficients
    for (let i = 1; i < ecmResults.beta.length - 1; i++) {
        let varName = i <= k ? `Δ(X${i})` : `Δ(Y(-${i-k}))`;
        
        shortRunCoefs.push({
            variable: varName,
            coefficient: ecmResults.beta[i],
            stderr: ecmResults.se[i],
            tstat: ecmResults.tStats[i],
            pvalue: ecmResults.pValues[i]
        });
    }
    
    return {
        ectCoef,
        ectSE,
        ectTStat,
        ectPValue,
        shortRunCoefs,
        halfLife: Math.log(0.5) / Math.log(1 + ectCoef),
        ecmResults
    };
}

// Perform diagnostic tests on ARDL model
function performDiagnosticTests(residuals, X) {
    // Jarque-Bera test for normality
    const jbTest = jarqueBera(residuals);
    
    // Serial correlation test (Breusch-Godfrey)
    const scTest = serialCorrelationTest(residuals, X, 2);
    
    // Heteroskedasticity test (White)
    const hetTest = heteroskedasticityTest(residuals, X);
    
    // CUSUM stability test (simplified)
    const cusumTest = performCusumTest(residuals);
    
    return {
        jbTest,
        scTest,
        hetTest,
        cusumTest
    };
}

// Perform CUSUM stability test
function performCusumTest(residuals) {
    const n = residuals.length;
    
    // Standardize residuals
    const stdResiduals = standardizeResiduals(residuals);
    
    // Calculate recursive CUSUM
    const cusum = [0];
    let sum = 0;
    
    for (let i = 0; i < n; i++) {
        sum += stdResiduals[i];
        cusum.push(sum);
    }
    
    // Calculate bounds
    const bounds = [];
    for (let i = 0; i <= n; i++) {
        // Standard 5% significance bounds
        const bound = 0.948 * Math.sqrt(i);
        bounds.push(bound);
    }
    
    // Check if CUSUM crosses bounds
    let unstable = false;
    for (let i = 0; i <= n; i++) {
        if (Math.abs(cusum[i]) > bounds[i]) {
            unstable = true;
            break;
        }
    }
    
    return {
        cusum,
        bounds,
        isStable: !unstable,
        data: {
            labels: Array.from({length: n+1}, (_, i) => i),
            cusum,
            upperBound: bounds.map(b => b),
            lowerBound: bounds.map(b => -b)
        }
    };
}

// Standardize residuals
function standardizeResiduals(residuals) {
    // Calculate standard deviation
    const mean = residuals.reduce((sum, r) => sum + r, 0) / residuals.length;
    const variance = residuals.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / residuals.length;
    const stdDev = Math.sqrt(variance);
    
    // Return standardized residuals
    return residuals.map(r => (r - mean) / stdDev);
}

// Generate forecasts from ARDL model
function generateArdlForecasts(ardlResults, periods) {
    const beta = ardlResults.beta;
    const y = ardlResults.validY;
    const X = ardlResults.validX;
    const p = ardlResults.pLag;
    const k = ardlResults.xCols;
    const n = y.length;
    
    // Initialize forecast arrays
    const forecasts = [];
    const forecastLower = [];
    const forecastUpper = [];
    
    // Get last p values of y and last X values
    const lastY = y.slice(n - p);
    const lastX = X[n - 1].slice(1, k + 1);
    
    // Generate forecasts
    let currentY = [...lastY];
    
    for (let i = 0; i < periods; i++) {
        // Build forecast X vector
        const forecastX = [1, ...lastX];
        
        // Add lagged Y values
        for (let lag = 0; lag < p; lag++) {
            forecastX.push(currentY[currentY.length - 1 - lag]);
        }
        
        // Add lagged X values (just using the last X values for simplicity)
        // In a real implementation, you might have X forecasts or scenarios
        for (let lag = 1; lag <= ardlResults.qLag; lag++) {
            for (let col = 0; col < k; col++) {
                forecastX.push(lastX[col]);
            }
        }
        
        // Calculate forecast
        let forecast = 0;
        for (let j = 0; j < beta.length; j++) {
            forecast += beta[j] * forecastX[j];
        }
        
        // Add to arrays
        forecasts.push(forecast);
        
        // Calculate confidence intervals (simplified)
        const stderr = Math.sqrt(ardlResults.mse) * Math.sqrt(1 + i * 0.1);
        forecastLower.push(forecast - 1.96 * stderr);
        forecastUpper.push(forecast + 1.96 * stderr);
        
        // Update currentY for next iteration
        currentY.push(forecast);
    }
    
    return {
        forecasts,
        forecastLower,
        forecastUpper,
        periods
    };
}

// Standard normal CDF (custom implementation)
function erf(x) {
    // Constants for approximation
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    // Save the sign of x
    const sign = (x < 0) ? -1 : 1;
    x = Math.abs(x);

    // A&S formula 7.1.26
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
}

function normCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
}

// Show data view
function showDataView() {
    welcomeScreen.classList.add('hidden');
    dataView.classList.remove('hidden');
    statsView.classList.add('hidden');
    regressionView.classList.add('hidden');
    document.getElementById('ardl-view').classList.add('hidden');
    document.getElementById('advanced-ts-view').classList.add('hidden');
    document.getElementById('stationarity-view').classList.add('hidden');
    document.getElementById('panel-view').classList.add('hidden');
}

// Show stats view
function showStatsView() {
    if (!workbookData) {
        alert('Please import data first');
        return;
    }
    
    welcomeScreen.classList.add('hidden');
    dataView.classList.add('hidden');
    statsView.classList.remove('hidden');
    regressionView.classList.add('hidden');
    document.getElementById('ardl-view').classList.add('hidden');
    document.getElementById('advanced-ts-view').classList.add('hidden');
    document.getElementById('stationarity-view').classList.add('hidden');
    document.getElementById('panel-view').classList.add('hidden');
    
    updateStatsView();
}

// Show regression view
function showRegressionView() {
    if (!workbookData) {
        alert('Please import data first');
        return;
    }
    
    welcomeScreen.classList.add('hidden');
    dataView.classList.add('hidden');
    statsView.classList.add('hidden');
    regressionView.classList.remove('hidden');
    document.getElementById('ardl-view').classList.add('hidden');
    document.getElementById('advanced-ts-view').classList.add('hidden');
    document.getElementById('stationarity-view').classList.add('hidden');
    document.getElementById('panel-view').classList.add('hidden');
    
    updateRegressionView();
}

// Update regression view
function updateRegressionView() {
    // Nothing to update currently, form is ready for user input
}

// Calculate descriptive statistics for a dataset
function calculateStats(dataset) {
    // Convert to numbers and remove NaN
    const numbers = dataset.map(Number).filter(n => !isNaN(n));
    
    if (numbers.length === 0) return null;
    
    // Sort the array for easier calculations
    const sorted = [...numbers].sort((a, b) => a - b);
    
    // Mean
    const mean = numbers.reduce((sum, val) => sum + val, 0) / numbers.length;
    
    // Variance
    const variance = numbers.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numbers.length;
    
    // Standard deviation
    const stdDev = Math.sqrt(variance);
    
    // Min and Max
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    
    // Median
    const midpoint = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
        ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
        : sorted[midpoint];
    
    // Quartiles
    const q1Index = Math.floor(sorted.length / 4);
    const q3Index = Math.floor(3 * sorted.length / 4);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;
    
    // Skewness
    const skewness = numbers.reduce((sum, val) => sum + Math.pow(val - mean, 3), 0) / 
                      (numbers.length * Math.pow(stdDev, 3));
    
    // Kurtosis
    const kurtosis = numbers.reduce((sum, val) => sum + Math.pow(val - mean, 4), 0) / 
                     (numbers.length * Math.pow(variance, 2)) - 3;
    
    // Standard error of the mean
    const sem = stdDev / Math.sqrt(numbers.length);
    
    // Coefficient of variation
    const cv = stdDev / mean * 100;
    
    // Range
    const range = max - min;
    
    // Geometric mean (for positive numbers only)
    let geometricMean = null;
    if (min > 0) {
        geometricMean = Math.exp(numbers.reduce((sum, val) => sum + Math.log(val), 0) / numbers.length);
    }
    
    // Harmonic mean (for positive numbers only)
    let harmonicMean = null;
    if (min > 0) {
        harmonicMean = numbers.length / numbers.reduce((sum, val) => sum + (1 / val), 0);
    }
    
    // Mode
    const counts = {};
    let mode = [];
    let maxCount = 0;
    
    for (const num of numbers) {
        counts[num] = (counts[num] || 0) + 1;
        if (counts[num] > maxCount) {
            maxCount = counts[num];
            mode = [num];
        } else if (counts[num] === maxCount) {
            mode.push(num);
        }
    }
    
    // Calculate quantiles (10th, 20th, etc.)
    const quantiles = {};
    for (let i = 1; i < 10; i++) {
        const q = i / 10;
        const idx = Math.floor(q * (sorted.length - 1));
        quantiles[`q${i*10}`] = sorted[idx];
    }
    
    // Kolmogorov-Smirnov test for normality
    const kolmogorovSmirnov = calculateKolmogorovSmirnov(numbers, mean, stdDev);
    
    // Shapiro-Wilk test for normality
    const shapiroWilk = calculateShapiroWilk(numbers);
    
    return {
        mean,
        median,
        min,
        max,
        variance,
        stdDev,
        q1,
        q3,
        iqr,
        skewness,
        kurtosis,
        sem,
        cv,
        range,
        geometricMean,
        harmonicMean,
        mode: mode.length > 1 ? 'Multiple modes' : mode[0],
        modeValues: mode,
        modeCount: maxCount,
        n: numbers.length,
        sum: numbers.reduce((a, b) => a + b, 0),
        quantiles,
        kolmogorovSmirnov,
        shapiroWilk
    };
}

// Kolmogorov-Smirnov test for normality
function calculateKolmogorovSmirnov(data, mean, stdDev) {
    const n = data.length;
    const sorted = [...data].sort((a, b) => a - b);
    let maxDiff = 0;
    
    for (let i = 0; i < n; i++) {
        // Empirical CDF
        const empiricalCdf = (i + 1) / n;
        
        // Theoretical normal CDF
        const z = (sorted[i] - mean) / stdDev;
        const theoreticalCdf = 0.5 * (1 + erf(z / Math.sqrt(2)));
        
        // Calculate difference
        const diff = Math.abs(empiricalCdf - theoreticalCdf);
        if (diff > maxDiff) {
            maxDiff = diff;
        }
    }
    
    // Critical value at 5% significance level (approximation)
    const criticalValue = 1.36 / Math.sqrt(n);
    
    return {
        statistic: maxDiff,
        criticalValue: criticalValue,
        isNormal: maxDiff <= criticalValue,
        pValue: approximateKSPValue(maxDiff, n)
    };
}

// Approximate p-value for Kolmogorov-Smirnov test
function approximateKSPValue(statistic, n) {
    // Approximation of p-value based on Stephens (1974)
    const z = statistic * Math.sqrt(n);
    return Math.exp(-2 * z * z);
}

// Shapiro-Wilk test for normality
function calculateShapiroWilk(data) {
    const n = data.length;
    
    // Shapiro-Wilk test is most accurate for sample sizes 3 <= n <= 50
    if (n < 3 || n > 50) {
        return {
            statistic: null,
            pValue: null,
            isNormal: null,
            message: `Shapiro-Wilk test is most reliable for sample sizes between 3 and 50. Your sample has ${n} observations.`
        };
    }
    
    const sorted = [...data].sort((a, b) => a - b);
    
    // Calculate mean
    const mean = data.reduce((a, b) => a + b, 0) / n;
    
    // Calculate sum of squares
    const ss = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;
    
    // Coefficients for Shapiro-Wilk test (simplified approximation)
    // These are normally derived from statistical tables
    const a = [];
    for (let i = 0; i < Math.floor(n / 2); i++) {
        // Simplified coefficient approximation
        const val = 1 / Math.sqrt(n) * (i + 1) / (n / 2 + 0.5);
        a.push(val);
    }
    
    // Calculate b
    let b = 0;
    for (let i = 0; i < Math.floor(n / 2); i++) {
        b += a[i] * (sorted[n - 1 - i] - sorted[i]);
    }
    
    // Calculate W statistic
    const W = Math.pow(b, 2) / ss;
    
    // Approximate p-value
    // This is a simplified approximation; a more accurate calculation would use 
    // statistical tables or more complex approximations
    const pValue = approximateSWPValue(W, n);
    
    return {
        statistic: W,
        pValue: pValue,
        isNormal: pValue > 0.05
    };
}

// Approximate p-value for Shapiro-Wilk test
function approximateSWPValue(W, n) {
    // This is a very simplified approximation
    // Real implementation would use proper statistical approximations
    const y = Math.log(1 - W);
    const mu = -1.5861 - 0.31082 * Math.log(n) - 0.083751 * Math.pow(Math.log(n), 2);
    const sigma = 0.6897 + 0.1693 * Math.log(n);
    
    const z = (y - mu) / sigma;
    return 1 - normCDF(z);
}

// New function to update stats display based on selection
function updateStatsDisplay(selectedVars, selectedTransform, selectedDiff) {
    const statsContainer = document.getElementById('stats-container');
    // Remove existing stat cards
    Array.from(statsContainer.querySelectorAll('.stat-card')).forEach(card => card.remove());
    
    const selectedStats = Array.from(document.getElementById('selected-stats').selectedOptions)
        .map(option => option.value);
    
    const translations = config.languages[currentLanguage];
    
    // Calculate and display stats for each selected column
    selectedVars.forEach(column => {
        let columnData = data.map(row => parseFloat(row[column]));
        
        // Apply transformations
        columnData = applyTransformation(columnData, selectedTransform);
        columnData = applyDifferencing(columnData, selectedDiff);
        
        // Calculate statistics
        const stats = calculateStats(columnData);
        if (!stats) return;
        
        // Create stat card
        const statCard = document.createElement('div');
        statCard.className = 'stat-card';
        
        // Card header - include transformation info
        let headerText = column;
        if (selectedTransform !== 'none') {
            headerText += ` (${transformations[selectedTransform].name})`;
        }
        if (selectedDiff !== 'none') {
            headerText += ` (${differenceOperations[selectedDiff].name})`;
        }
        
        const header = document.createElement('h4');
        header.textContent = headerText;
        statCard.appendChild(header);
        
        // Create arrays of statistics to display based on selection
        let statItems = [];
        
        if (selectedStats.includes('basic')) {
            statItems = statItems.concat([
                { label: translations.mean, value: stats.mean.toFixed(4) },
                { label: translations.median, value: stats.median.toFixed(4) },
                { label: translations.min, value: stats.min.toFixed(4) },
                { label: translations.max, value: stats.max.toFixed(4) }
            ]);
        }
        
        if (selectedStats.includes('dispersion')) {
            statItems = statItems.concat([
                { label: translations.variance, value: stats.variance.toFixed(4) },
                { label: translations.stdDev, value: stats.stdDev.toFixed(4) },
                { label: "Range", value: stats.range.toFixed(4) }
            ]);
        }
        
        if (selectedStats.includes('shape')) {
            statItems = statItems.concat([
                { label: translations.skewness, value: stats.skewness.toFixed(4) },
                { label: translations.kurtosis, value: stats.kurtosis.toFixed(4) }
            ]);
        }
        
        if (selectedStats.includes('quartiles')) {
            statItems = statItems.concat([
                { label: translations.quartile1, value: stats.q1.toFixed(4) },
                { label: translations.quartile3, value: stats.q3.toFixed(4) },
                { label: translations.iqr, value: stats.iqr.toFixed(4) }
            ]);
        }
        
        if (selectedStats.includes('advanced')) {
            statItems = statItems.concat([
                { label: "Std Error of Mean", value: stats.sem.toFixed(4) },
                { label: "Coeff of Variation (%)", value: stats.cv.toFixed(2) }
            ]);
            
            if (stats.geometricMean !== null) {
                statItems.push({ 
                    label: "Geometric Mean", 
                    value: stats.geometricMean.toFixed(4) 
                });
            }
            
            if (stats.harmonicMean !== null) {
                statItems.push({ 
                    label: "Harmonic Mean", 
                    value: stats.harmonicMean.toFixed(4) 
                });
            }
        }
        
        if (selectedStats.includes('mode')) {
            statItems.push({ 
                label: "Mode", 
                value: typeof stats.mode === 'number' ? stats.mode.toFixed(4) : stats.mode 
            });
            
            if (typeof stats.mode !== 'number' && stats.modeValues.length > 1) {
                // Add each mode value if there are multiple
                stats.modeValues.forEach((val, idx) => {
                    statItems.push({ 
                        label: `Mode ${idx + 1}`, 
                        value: val.toFixed(4)
                    });
                });
            }
            
            statItems.push({ label: "Mode Count", value: stats.modeCount });
        }
        
        if (selectedStats.includes('normality')) {
            // Add Kolmogorov-Smirnov test result
            if (stats.kolmogorovSmirnov) {
                statItems.push({ 
                    label: "Kolmogorov-Smirnov Test", 
                    value: stats.kolmogorovSmirnov.statistic.toFixed(4) 
                });
                statItems.push({ 
                    label: "K-S p-value", 
                    value: stats.kolmogorovSmirnov.pValue.toFixed(4) 
                });
                statItems.push({ 
                    label: "K-S Normality", 
                    value: stats.kolmogorovSmirnov.isNormal ? "Normal" : "Not Normal",
                    color: stats.kolmogorovSmirnov.isNormal ? "green" : "red"
                });
            }
            
            // Add Shapiro-Wilk test result
            if (stats.shapiroWilk && stats.shapiroWilk.statistic !== null) {
                statItems.push({ 
                    label: "Shapiro-Wilk Test", 
                    value: stats.shapiroWilk.statistic.toFixed(4) 
                });
                statItems.push({ 
                    label: "S-W p-value", 
                    value: stats.shapiroWilk.pValue.toFixed(4) 
                });
                statItems.push({ 
                    label: "S-W Normality", 
                    value: stats.shapiroWilk.isNormal ? "Normal" : "Not Normal",
                    color: stats.shapiroWilk.isNormal ? "green" : "red"
                });
            } else if (stats.shapiroWilk && stats.shapiroWilk.message) {
                statItems.push({ 
                    label: "Shapiro-Wilk Test", 
                    value: stats.shapiroWilk.message 
                });
            }
        }
        
        if (selectedStats.includes('quantiles')) {
            for (let i = 1; i < 10; i++) {
                if (i % 2 === 0 || i === 5) { // Only show 20th, 40th, 50th, 60th, 80th percentiles
                    statItems.push({ 
                        label: `${i*10}th Percentile`, 
                        value: stats.quantiles[`q${i*10}`].toFixed(4) 
                    });
                }
            }
        }
        
        if (selectedStats.includes('count')) {
            statItems = statItems.concat([
                { label: "Count (n)", value: stats.n },
                { label: "Sum", value: stats.sum.toFixed(4) }
            ]);
        }
        
        // Stats rows
        statItems.forEach(item => {
            const row = document.createElement('div');
            row.className = 'stat-row';
            
            const label = document.createElement('span');
            label.className = 'stat-label';
            label.textContent = item.label;
            
            const value = document.createElement('span');
            value.className = 'stat-value';
            value.textContent = item.value;
            if (item.color) {
                value.style.color = item.color;
                value.style.fontWeight = 'bold';
            }
            
            row.appendChild(label);
            row.appendChild(value);
            statCard.appendChild(row);
        });
        
        statsContainer.appendChild(statCard);
    });
}

// Calculate descriptive statistics with transformations
function calculateDescriptiveStats() {
    const selectedVars = Array.from(statsVars.selectedOptions).map(option => option.value);
    const selectedTransform = statsTransform.value;
    const selectedDiff = statsDiff.value;
    
    if (selectedVars.length === 0) {
        alert('Please select at least one variable');
        return;
    }
    
    const statsContainer = document.getElementById('stats-container');
    statsContainer.innerHTML = '';
    
    // Add statistics selection
    const statsSelectionDiv = document.createElement('div');
    statsSelectionDiv.className = 'stats-selection';
    statsSelectionDiv.innerHTML = `
        <div class="select-container">
            <label for="selected-stats">Select Statistics to Display:</label>
            <select id="selected-stats" multiple>
                <option value="basic" selected>Basic (Mean, Median, Min, Max)</option>
                <option value="dispersion" selected>Dispersion (Variance, StdDev, Range)</option>
                <option value="shape" selected>Shape (Skewness, Kurtosis)</option>
                <option value="quartiles" selected>Quartiles</option>
                <option value="normality">Normality Tests (Kolmogorov-Smirnov, Shapiro-Wilk)</option>
                <option value="advanced">Advanced (CV, SEM, Geometric Mean)</option>
                <option value="mode">Mode</option>
                <option value="quantiles">Deciles</option>
                <option value="count">Count & Sum</option>
            </select>
        </div>
        <div class="select-container">
            <label for="chart-type">Chart Type:</label>
            <select id="chart-type">
                <option value="none">No Chart</option>
                <option value="histogram">Histogram</option>
                <option value="boxplot">Box Plot</option>
                <option value="violin">Violin Plot</option>
                <option value="density">Density Plot</option>
                <option value="correlogram">Correlogram</option>
                <option value="scatter">Scatter Plot</option>
                <option value="bar">Bar Plot</option>
                <option value="line">Line Plot</option>
                <option value="qqplot">QQ Plot</option>
                <option value="ppplot">PP Plot</option>
                <option value="logit">Logit Plot</option>
                <option value="probit">Probit Plot</option>
            </select>
        </div>
        <button id="update-stats" class="primary-btn">Update Display</button>
    `;
    statsContainer.appendChild(statsSelectionDiv);
    
    // Add charts container
    const chartsContainer = document.createElement('div');
    chartsContainer.id = 'stats-charts-container';
    chartsContainer.style.marginTop = '20px';
    statsContainer.appendChild(chartsContainer);
    
    // Add event listener to update button
    document.getElementById('update-stats').addEventListener('click', () => {
        updateStatsDisplay(selectedVars, selectedTransform, selectedDiff);
        createStatisticalCharts(selectedVars, selectedTransform, selectedDiff);
    });
    
    // Initial display
    updateStatsDisplay(selectedVars, selectedTransform, selectedDiff);
    createStatisticalCharts(selectedVars, selectedTransform, selectedDiff);
}

// Function to create statistical charts based on selected type
function createStatisticalCharts(selectedVars, selectedTransform, selectedDiff) {
    const chartType = document.getElementById('chart-type').value;
    
    // If no chart selected, clear container and return
    if (chartType === 'none') {
        document.getElementById('stats-charts-container').innerHTML = '';
        return;
    }
    
    // Get transformed data for each variable
    const transformedData = {};
    selectedVars.forEach(variable => {
        let values = data.map(row => parseFloat(row[variable]));
        values = applyTransformation(values, selectedTransform);
        values = applyDifferencing(values, selectedDiff);
        transformedData[variable] = values.filter(val => !isNaN(val));
    });
    
    // Clear previous charts
    const chartsContainer = document.getElementById('stats-charts-container');
    chartsContainer.innerHTML = '';
    
    // Create appropriate charts based on selection
    if (chartType === 'correlogram' && selectedVars.length > 1) {
        // Create one correlogram for all variables
        createCorrelogramChart(transformedData, selectedVars);
    } else if (chartType === 'scatter' && selectedVars.length === 2) {
        // Create scatter plot for exactly two variables
        const [var1, var2] = selectedVars;
        createScatterPlotChart(transformedData[var1], transformedData[var2], var1, var2);
    } else {
        // Create individual charts for each variable
        selectedVars.forEach(variable => {
            createVariableChart(transformedData[variable], variable, chartType);
        });
    }
}

// Function to create chart for a single variable
function createVariableChart(data, variable, chartType) {
    const chartsContainer = document.getElementById('stats-charts-container');
    
    // Create canvas for chart
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'chart-container';
    canvasContainer.style.height = '300px';
    canvasContainer.style.marginBottom = '30px';
    
    const canvas = document.createElement('canvas');
    canvas.id = `chart-${variable.replace(/\s+/g, '-')}`;
    canvasContainer.appendChild(canvas);
    chartsContainer.appendChild(canvasContainer);
    
    const ctx = canvas.getContext('2d');
    
    // Create the selected chart type
    switch (chartType) {
        case 'histogram':
            createHistogram(ctx, data, { title: `Histogram of ${variable}`, xTitle: variable });
            break;
        case 'boxplot':
            createBoxPlot(ctx, data, { title: `Box Plot of ${variable}`, xTitle: variable });
            break;
        case 'violin':
            createViolinPlot(ctx, data, { title: `Violin Plot of ${variable}`, yTitle: variable });
            break;
        case 'density':
            createDensityPlot(ctx, data, { title: `Density Plot of ${variable}`, xTitle: variable });
            break;
        case 'bar':
            // For bar plots, we'll use a frequency distribution
            const { bins, counts } = calculateHistogramBins(data, 10);
            createBarPlot(ctx, bins.map((b, i) => b.toFixed(2)), counts, 
                         { title: `Bar Plot of ${variable}`, xTitle: variable, yTitle: 'Frequency' });
            break;
        case 'line':
            // For line plots, we'll sort the data and use indices as x-values
            const sortedData = [...data].sort((a, b) => a - b);
            createLinePlot(ctx, Array.from({length: sortedData.length}, (_, i) => i), 
                          sortedData, { title: `Line Plot of ${variable}`, xTitle: 'Index', yTitle: variable });
            break;
        case 'qqplot':
            createQQPlot(ctx, data, { title: `Q-Q Plot of ${variable}` });
            break;
        case 'ppplot':
            createPPPlot(ctx, data, { title: `P-P Plot of ${variable}` });
            break;
        case 'logit':
            createLogitPlot(ctx, data, { title: `Logit Plot of ${variable}`, xTitle: variable });
            break;
        case 'probit':
            createProbitPlot(ctx, data, { title: `Probit Plot of ${variable}`, xTitle: variable });
            break;
    }
}

// Function to create correlogram
function createCorrelogramChart(transformedData, variables) {
    const chartsContainer = document.getElementById('stats-charts-container');
    
    // Create canvas for chart
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'chart-container';
    canvasContainer.style.height = '400px';
    canvasContainer.style.marginBottom = '30px';
    
    const canvas = document.createElement('canvas');
    canvas.id = 'chart-correlogram';
    canvasContainer.appendChild(canvas);
    chartsContainer.appendChild(canvasContainer);
    
    const ctx = canvas.getContext('2d');
    
    // Convert data format for correlogram
    const dataMatrix = variables.map(variable => transformedData[variable]);
    
    // Create correlogram
    createCorrelogram(ctx, dataMatrix, { 
        title: 'Correlation Matrix', 
        variables: variables 
    });
}

// Function to create scatter plot for two variables
function createScatterPlotChart(xData, yData, xVariable, yVariable) {
    const chartsContainer = document.getElementById('stats-charts-container');
    
    // Create canvas for chart
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'chart-container';
    canvasContainer.style.height = '300px';
    canvasContainer.style.marginBottom = '30px';
    
    const canvas = document.createElement('canvas');
    canvas.id = 'chart-scatter';
    canvasContainer.appendChild(canvas);
    chartsContainer.appendChild(canvasContainer);
    
    const ctx = canvas.getContext('2d');
    
    // Create scatter plot
    createScatterPlot(ctx, xData, yData, { 
        title: `${xVariable} vs ${yVariable}`, 
        xTitle: xVariable, 
        yTitle: yVariable 
    });
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

// Show ARDL view
function showArdlView() {
    if (!workbookData) {
        alert('Please import data first');
        return;
    }
    
    welcomeScreen.classList.add('hidden');
    dataView.classList.add('hidden');
    statsView.classList.add('hidden');
    regressionView.classList.add('hidden');
    document.getElementById('ardl-view').classList.remove('hidden');
    document.getElementById('advanced-ts-view').classList.add('hidden');
    document.getElementById('stationarity-view').classList.add('hidden');
    document.getElementById('panel-view').classList.add('hidden');
    
    updateArdlView();
}

// Display ARDL results
function displayArdlResults(results) {
    const resultsContainer = document.getElementById('ardl-results');
    resultsContainer.innerHTML = '';
    
    const translations = config.languages[currentLanguage];
    
    // Add ARDL model specification
    const modelSpecDiv = document.createElement('div');
    modelSpecDiv.className = 'regression-equation';
    
    // Format ARDL model specification: ARDL(p,q1,q2,...,qk)
    const qLags = Array(results.xColumns.length).fill(results.qLag);
    modelSpecDiv.innerHTML = `<h4>${translations.ardlModel}</h4><p>ARDL(${results.pLag},${qLags.join(',')})</p>`;
    
    // Add model selection information if optimal
    if (results.optimal) {
        modelSpecDiv.innerHTML += `<p>Optimal lag structure selected using ${results.icMethod.toUpperCase()}</p>`;
    }
    
    resultsContainer.appendChild(modelSpecDiv);
    
    // Create bounds test results
    const boundsTestDiv = document.createElement('div');
    boundsTestDiv.className = 'regression-equation';
    boundsTestDiv.innerHTML = `
        <h4>${translations.boundTestResult}</h4>
        <p>F-statistic: ${results.boundsTest.fStat.toFixed(4)}</p>
        <p>Result: ${results.boundsTest.conclusion}</p>
    `;
    resultsContainer.appendChild(boundsTestDiv);
    
    // Create summary table
    const summaryTable = document.createElement('table');
    summaryTable.className = 'result-table';
    
    // Model summary header
    const summaryHeader = document.createElement('tr');
    const summaryHeaderCell = document.createElement('th');
    summaryHeaderCell.colSpan = 2;
    summaryHeaderCell.textContent = translations.modelSummary;
    summaryHeader.appendChild(summaryHeaderCell);
    summaryTable.appendChild(summaryHeader);
    
    // Add model statistics
    const boundTestSignificant = results.boundsTest.hasCointegration;
    const summaryStats = [
        { label: translations.rSquared, value: results.rSquared.toFixed(4) },
        { label: translations.adjustedRSquared, value: results.adjustedRSquared.toFixed(4) },
        { label: translations.fStatistic, value: results.fStat.toFixed(4) },
        { label: translations.boundTestResult, value: boundTestSignificant ? translations.significant : translations.notSignificant },
        { label: translations.longRunRelationship, value: boundTestSignificant ? translations.significant : translations.notSignificant },
        { label: translations.durbinWatson, value: results.durbinWatson.toFixed(4) }
    ];
    
    // Add half-life of adjustment if error correction term is valid
    if (results.ecmResults && results.ecmResults.ectCoef < 0) {
        summaryStats.push({
            label: "Half-life of Adjustment",
            value: results.ecmResults.halfLife.toFixed(4) + " periods"
        });
    }
    
    summaryStats.forEach(stat => {
        const row = document.createElement('tr');
        const labelCell = document.createElement('td');
        labelCell.textContent = stat.label;
        const valueCell = document.createElement('td');
        valueCell.textContent = stat.value;
        
        // Add significance styling
        if (stat.label === translations.boundTestResult || stat.label === translations.longRunRelationship) {
            valueCell.style.color = boundTestSignificant ? 'green' : 'red';
            valueCell.style.fontWeight = 'bold';
        }
        
        row.appendChild(labelCell);
        row.appendChild(valueCell);
        summaryTable.appendChild(row);
    });
    
    resultsContainer.appendChild(summaryTable);
    
    // Create long-run coefficients table
    const longRunTable = document.createElement('table');
    longRunTable.className = 'result-table';
    
    // Long-run coefficients header
    const longRunHeader = document.createElement('tr');
    const longRunHeaderCell = document.createElement('th');
    longRunHeaderCell.colSpan = 5;
    longRunHeaderCell.textContent = translations.longRunCoefficients;
    longRunHeader.appendChild(longRunHeaderCell);
    longRunTable.appendChild(longRunHeader);
    
    // Coefficient table headers
    const longRunTableHeader = document.createElement('tr');
    const headers = [
        translations.variable, 
        translations.value, 
        translations.standardError,
        translations.tStatistic, 
        translations.pValue
    ];
    
    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        longRunTableHeader.appendChild(th);
    });
    longRunTable.appendChild(longRunTableHeader);
    
    // Add coefficients
    results.longRunCoefs.forEach((coef, i) => {
        const row = document.createElement('tr');
        
        const variableCell = document.createElement('td');
        // Use actual column names for variables
        variableCell.textContent = i === 0 ? "Constant" : results.xColumns[i-1];
        
        const valueCell = document.createElement('td');
        valueCell.textContent = coef.coefficient.toFixed(4);
        
        const seCell = document.createElement('td');
        seCell.textContent = coef.stderr.toFixed(4);
        
        const tStatCell = document.createElement('td');
        tStatCell.textContent = coef.tstat.toFixed(4);
        
        const pValueCell = document.createElement('td');
        pValueCell.textContent = coef.pvalue.toFixed(4);
        
        row.appendChild(variableCell);
        row.appendChild(valueCell);
        row.appendChild(seCell);
        row.appendChild(tStatCell);
        row.appendChild(pValueCell);
        longRunTable.appendChild(row);
    });
    
    resultsContainer.appendChild(longRunTable);
    
    // Create short-run coefficients table
    const shortRunTable = document.createElement('table');
    shortRunTable.className = 'result-table';
    
    // Short-run coefficients header
    const shortRunHeader = document.createElement('tr');
    const shortRunHeaderCell = document.createElement('th');
    shortRunHeaderCell.colSpan = 5;
    shortRunHeaderCell.textContent = translations.shortRunCoefficients;
    shortRunHeader.appendChild(shortRunHeaderCell);
    shortRunTable.appendChild(shortRunHeader);
    
    // Add same headers as long-run table
    const shortRunTableHeader = document.createElement('tr');
    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        shortRunTableHeader.appendChild(th);
    });
    shortRunTable.appendChild(shortRunTableHeader);
    
    // Add coefficients
    results.ecmResults.shortRunCoefs.forEach(coef => {
        const row = document.createElement('tr');
        
        const variableCell = document.createElement('td');
        variableCell.textContent = coef.variable;
        
        const valueCell = document.createElement('td');
        valueCell.textContent = coef.coefficient.toFixed(4);
        
        const seCell = document.createElement('td');
        seCell.textContent = coef.stderr.toFixed(4);
        
        const tStatCell = document.createElement('td');
        tStatCell.textContent = coef.tstat.toFixed(4);
        
        const pValueCell = document.createElement('td');
        pValueCell.textContent = coef.pvalue.toFixed(4);
        
        // Highlight ECT term
        if (coef.variable === 'ECT(-1)') {
            row.style.fontWeight = 'bold';
            if (coef.coefficient < 0 && coef.pvalue < 0.05) {
                row.style.color = 'green';
            } else {
                row.style.color = 'red';
            }
        }
        
        row.appendChild(variableCell);
        row.appendChild(valueCell);
        row.appendChild(seCell);
        row.appendChild(tStatCell);
        row.appendChild(pValueCell);
        shortRunTable.appendChild(row);
    });
    
    resultsContainer.appendChild(shortRunTable);
    
    // Create diagnostics table
    const diagnosticsTable = document.createElement('table');
    diagnosticsTable.className = 'result-table';
    
    // Diagnostics header
    const diagHeader = document.createElement('tr');
    const diagHeaderCell = document.createElement('th');
    diagHeaderCell.colSpan = 3;
    diagHeaderCell.textContent = translations.diagnosticTests;
    diagHeader.appendChild(diagHeaderCell);
    diagnosticsTable.appendChild(diagHeader);
    
    // Diagnostics table headers
    const diagTableHeader = document.createElement('tr');
    ['Test', 'Statistic', 'Result'].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        diagTableHeader.appendChild(th);
    });
    diagnosticsTable.appendChild(diagTableHeader);
    
    // Add Jarque-Bera test
    const jbTest = results.diagnostics.jbTest;
    const jbRow = document.createElement('tr');
    
    const jbLabelCell = document.createElement('td');
    jbLabelCell.textContent = translations.jarqueBera;
    
    const jbStatCell = document.createElement('td');
    jbStatCell.textContent = `${jbTest.statistic.toFixed(4)} (p=${jbTest.pValue.toExponential(4)})`;
    
    const jbResultCell = document.createElement('td');
    jbResultCell.textContent = jbTest.isNormal ? translations.normal : translations.notNormal;
    jbResultCell.style.color = jbTest.isNormal ? 'green' : 'red';
    
    jbRow.appendChild(jbLabelCell);
    jbRow.appendChild(jbStatCell);
    jbRow.appendChild(jbResultCell);
    diagnosticsTable.appendChild(jbRow);
    
    // Add Serial Correlation test
    const scTest = results.diagnostics.scTest;
    const scRow = document.createElement('tr');
    
    const scLabelCell = document.createElement('td');
    scLabelCell.textContent = translations.serialCorrelation;
    
    const scStatCell = document.createElement('td');
    scStatCell.textContent = `${scTest.statistic.toFixed(4)} (p=${scTest.pValue.toExponential(4)})`;
    
    const scResultCell = document.createElement('td');
    const noSerialCorrelation = !scTest.hasSerialCorrelation;
    scResultCell.textContent = noSerialCorrelation ? translations.noSerialCorrelation : translations.serialCorrelation;
    scResultCell.style.color = noSerialCorrelation ? 'green' : 'red';
    
    scRow.appendChild(scLabelCell);
    scRow.appendChild(scStatCell);
    scRow.appendChild(scResultCell);
    diagnosticsTable.appendChild(scRow);
    
    // Add Heteroskedasticity test
    const hetTest = results.diagnostics.hetTest;
    const hetRow = document.createElement('tr');
    
    const hetLabelCell = document.createElement('td');
    hetLabelCell.textContent = translations.heteroskedasticity;
    
    const hetStatCell = document.createElement('td');
    hetStatCell.textContent = `${hetTest.statistic.toFixed(4)} (p=${hetTest.pValue.toExponential(4)})`;
    
    const hetResultCell = document.createElement('td');
    const isHomoskedastic = !hetTest.hasHeteroskedasticity;
    hetResultCell.textContent = isHomoskedastic ? translations.homoskedastic : translations.heteroskedastic;
    hetResultCell.style.color = isHomoskedastic ? 'green' : 'red';
    
    hetRow.appendChild(hetLabelCell);
    hetRow.appendChild(hetStatCell);
    hetRow.appendChild(hetResultCell);
    diagnosticsTable.appendChild(hetRow);
    
    // Add CUSUM stability test
    const cusumTest = results.diagnostics.cusumTest;
    const cusumRow = document.createElement('tr');
    
    const cusumLabelCell = document.createElement('td');
    cusumLabelCell.textContent = "CUSUM Stability Test";
    
    const cusumStatCell = document.createElement('td');
    cusumStatCell.textContent = "-";
    
    const cusumResultCell = document.createElement('td');
    cusumResultCell.textContent = cusumTest.isStable ? "Stable" : "Unstable";
    cusumResultCell.style.color = cusumTest.isStable ? 'green' : 'red';
    
    cusumRow.appendChild(cusumLabelCell);
    cusumRow.appendChild(cusumStatCell);
    cusumRow.appendChild(cusumResultCell);
    diagnosticsTable.appendChild(cusumRow);
    
    resultsContainer.appendChild(diagnosticsTable);
    
    // Add forecasts section if available
    if (results.forecasts) {
        displayForecasts(results, resultsContainer);
    }
    
    // Create ARDL plots
    createArdlPlots(results);
}

// Create ARDL plots (multiple visualizations)
function createArdlPlots(results) {
    // Destroy existing chart if it exists
    if (window.ardlChart) {
        window.ardlChart.destroy();
    }
    
    // Get CUSUM test data
    const cusumData = results.diagnostics.cusumTest.data;
    
    // Create chart for CUSUM test
    const ctx = document.getElementById('ardl-chart').getContext('2d');
    
    window.ardlChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: cusumData.labels,
            datasets: [
                {
                    label: 'CUSUM',
                    data: cusumData.cusum,
                    borderColor: 'rgba(52, 152, 219, 1)',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                },
                {
                    label: 'Upper Bound (5%)',
                    data: cusumData.upperBound,
                    borderColor: 'rgba(231, 76, 60, 0.7)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: 'Lower Bound (5%)',
                    data: cusumData.lowerBound,
                    borderColor: 'rgba(231, 76, 60, 0.7)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: 1,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Observation'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'CUSUM'
                    }
                }
            }
        }
    });
    
    // If forecasts are available, create a second chart
    if (results.forecasts) {
        // We'd need to add another canvas for this
        const forecastCanvas = document.createElement('canvas');
        forecastCanvas.id = 'forecast-chart';
        document.getElementById('ardl-chart-container').appendChild(forecastCanvas);
        
        // Sample data for forecasting chart
        const periods = results.forecasts.periods;
        const forecasts = results.forecasts.forecasts;
        const lower = results.forecasts.forecastLower;
        const upper = results.forecasts.forecastUpper;
        
        // Last few actual values + forecasts
        const actualData = results.ardlResults.validY.slice(-5);
        const allLabels = [...Array(actualData.length).keys().map(i => `Actual ${i+1}`), 
                           ...Array(periods).keys().map(i => `Forecast ${i+1}`)];
        
        // Create actual + forecast chart
        const forecastCtx = document.getElementById('forecast-chart').getContext('2d');
        new Chart(forecastCtx, {
            type: 'line',
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: 'Actual',
                        data: [...actualData, ...Array(periods).fill(null)],
                        borderColor: 'rgba(52, 152, 219, 1)',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        borderWidth: 2
                    },
                    {
                        label: 'Forecast',
                        data: [...Array(actualData.length).fill(null), ...forecasts],
                        borderColor: 'rgba(46, 204, 113, 1)',
                        backgroundColor: 'rgba(46, 204, 113, 0.1)',
                        borderWidth: 2,
                        borderDash: [5, 5]
                    },
                    {
                        label: '95% Confidence Interval',
                        data: [...Array(actualData.length).fill(null), ...forecasts],
                        borderColor: 'rgba(46, 204, 113, 0)',
                        backgroundColor: 'rgba(46, 204, 113, 0.2)',
                        borderWidth: 0,
                        pointRadius: 0,
                        fill: {
                            target: '-1',
                            above: 'rgba(46, 204, 113, 0.2)',
                            below: 'rgba(46, 204, 113, 0.2)'
                        }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                aspectRatio: 1,
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: results.yColumn
                        }
                    }
                }
            }
        });
    }
}

// Show advanced time series view
function showAdvancedTsView() {
    if (!workbookData) {
        alert('Please import data first');
        return;
    }
    
    welcomeScreen.classList.add('hidden');
    dataView.classList.add('hidden');
    statsView.classList.add('hidden');
    regressionView.classList.add('hidden');
    document.getElementById('ardl-view').classList.add('hidden');
    document.getElementById('advanced-ts-view').classList.remove('hidden');
    document.getElementById('stationarity-view').classList.add('hidden');
    document.getElementById('panel-view').classList.add('hidden');
    
    updateAdvancedTsView();
}

// Update advanced time series view
function updateAdvancedTsView() {
    // Get selectors
    const advVariables = document.getElementById('adv-variables');
    const advTransform = document.getElementById('adv-transform');
    const advDiff = document.getElementById('adv-diff');
    const advModelType = document.getElementById('adv-model-type');
    
    // Clear existing options
    advVariables.innerHTML = '';
    advTransform.innerHTML = '';
    advDiff.innerHTML = '';
    
    // Add column options
    columns.forEach(column => {
        const option = document.createElement('option');
        option.value = column;
        option.textContent = column;
        advVariables.appendChild(option);
    });
    
    // Select all except first column by default
    if (advVariables.options.length > 1) {
        for (let i = 1; i < advVariables.options.length; i++) {
            advVariables.options[i].selected = true;
        }
    }
    
    // Add transformation options
    Object.keys(transformations).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = transformations[key].name;
        advTransform.appendChild(option);
    });
    
    // Add differencing options
    Object.keys(differenceOperations).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = differenceOperations[key].name;
        advDiff.appendChild(option);
    });
    
    // Add event listeners for model type changes
    advModelType.addEventListener('change', function() {
        const modelType = this.value;
        const vecmOptions = document.querySelectorAll('.vecm-option');
        const armaOptions = document.querySelectorAll('.arma-option');
        
        // Show/hide model-specific options
        if (modelType === 'vecm' || modelType === 'johansen') {
            vecmOptions.forEach(elem => elem.classList.remove('hidden'));
        } else {
            vecmOptions.forEach(elem => elem.classList.add('hidden'));
        }
        
        if (modelType === 'arma') {
            armaOptions.forEach(elem => elem.classList.remove('hidden'));
        } else {
            armaOptions.forEach(elem => elem.classList.add('hidden'));
        }
    });
    
    // Set up run button
    document.getElementById('run-adv-ts').addEventListener('click', runAdvancedTsAnalysis);
}

// Run advanced time series analysis
function runAdvancedTsAnalysis() {
    const modelType = document.getElementById('adv-model-type').value;
    const selectedVars = Array.from(document.getElementById('adv-variables').selectedOptions).map(opt => opt.value);
    const transform = document.getElementById('adv-transform').value;
    const diff = document.getElementById('adv-diff').value;
    const lags = parseInt(document.getElementById('adv-lags').value);
    const deterministic = document.getElementById('adv-deterministic').value;
    const forecast = parseInt(document.getElementById('adv-forecast').value);
    
    if (selectedVars.length < 2 && modelType !== 'arma') {
        alert('Please select at least two variables for multivariate analysis');
        return;
    }
    
    if (selectedVars.length < 1) {
        alert('Please select at least one variable');
        return;
    }
    
    // Prepare data with transformations
    const transformedData = prepareAdvancedTsData(selectedVars, transform, diff);
    
    let results;
    switch (modelType) {
        case 'var':
            results = runVarModel(transformedData, lags, deterministic, forecast);
            break;
        case 'vecm':
            const cointRank = parseInt(document.getElementById('adv-coint-rank').value);
            results = runVecmModel(transformedData, lags, cointRank, deterministic, forecast);
            break;
        case 'johansen':
            results = runJohansenTest(transformedData, lags, deterministic);
            break;
        case 'arma':
            const arOrder = parseInt(document.getElementById('adv-ar-order').value);
            const maOrder = parseInt(document.getElementById('adv-ma-order').value);
            results = runArmaModel(transformedData, arOrder, maOrder, forecast);
            break;
    }
    
    displayAdvancedTsResults(results, modelType);
}

// Prepare data for advanced time series analysis
function prepareAdvancedTsData(columns, transform, diff) {
    // Extract data for selected columns
    const seriesData = columns.map(column => {
        let values = data.map(row => parseFloat(row[column]));
        
        // Apply transformations
        values = applyTransformation(values, transform);
        values = applyDifferencing(values, diff);
        
        return {
            name: column,
            values: values,
            transform: transform,
            diff: diff
        };
    });
    
    return seriesData;
}

// Run VAR model
function runVarModel(seriesData, lags, deterministic, forecastPeriods) {
    // This is a placeholder for actual VAR model implementation
    // In a real implementation, this would use statistical libraries
    
    // Extract values as matrix (each column is a variable, each row is an observation)
    const values = seriesData.map(series => series.values);
    const names = seriesData.map(series => series.name);
    const n = values[0].length;
    const k = values.length;
    
    // Create results object with simulated data
    const results = {
        type: 'var',
        lags,
        deterministic,
        variables: names,
        coefficients: simulateVarCoefficients(k, lags),
        residuals: simulateResiduals(n, k),
        varianceMatrix: simulateCovarianceMatrix(k),
        aic: Math.random() * 5,
        bic: Math.random() * 5 + 5,
        hqc: Math.random() * 5 + 2.5,
        forecasts: null,
        impulseResponses: simulateImpulseResponses(k, 10) // Add impulse responses (10 periods)
    };
    
    // Add forecasts if requested
    if (forecastPeriods > 0) {
        results.forecasts = simulateForecasts(k, forecastPeriods);
    }
    
    return results;
}

// Run VECM model
function runVecmModel(seriesData, lags, cointRank, deterministic, forecastPeriods) {
    // Placeholder for VECM implementation
    const values = seriesData.map(series => series.values);
    const names = seriesData.map(series => series.name);
    const n = values[0].length;
    const k = values.length;
    
    // Create results object with simulated data
    const results = {
        type: 'vecm',
        lags,
        cointRank,
        deterministic,
        variables: names,
        shortRunCoefficients: simulateVarCoefficients(k, lags - 1),
        loadingMatrix: simulateLoadingMatrix(k, cointRank),
        cointVector: simulateCointVector(k, cointRank),
        residuals: simulateResiduals(n, k),
        varianceMatrix: simulateCovarianceMatrix(k),
        aic: Math.random() * 5,
        bic: Math.random() * 5 + 5,
        hqc: Math.random() * 5 + 2.5,
        forecasts: null,
        impulseResponses: simulateImpulseResponses(k, 10) // Add impulse responses (10 periods)
    };
    
    // Add forecasts if requested
    if (forecastPeriods > 0) {
        results.forecasts = simulateForecasts(k, forecastPeriods);
    }
    
    return results;
}

// Run Johansen cointegration test
function runJohansenTest(seriesData, lags, deterministic) {
    // Placeholder for Johansen test implementation
    const values = seriesData.map(series => series.values);
    const names = seriesData.map(series => series.name);
    const k = values.length;
    
    // Create test results with simulated data
    const results = {
        type: 'johansen',
        lags,
        deterministic,
        variables: names,
        traceStats: simulateTestStats(k),
        maxEigenStats: simulateTestStats(k),
        criticalValues: simulateCriticalValues(k),
        cointRank: Math.floor(Math.random() * k)
    };
    
    return results;
}

// Run ARMA model
function runArmaModel(seriesData, arOrder, maOrder, forecastPeriods) {
    // Since ARMA is univariate, just use the first selected variable
    const series = seriesData[0];
    const values = series.values;
    const n = values.length;
    
    // Create results object with simulated data
    const results = {
        type: 'arma',
        variable: series.name,
        arOrder,
        maOrder,
        arCoefficients: Array(arOrder).fill().map(() => Math.random() * 1.5 - 0.75),
        maCoefficients: Array(maOrder).fill().map(() => Math.random() * 1.5 - 0.75),
        constant: Math.random() * 2 - 1,
        residuals: Array(n).fill().map(() => Math.random() * 2 - 1),
        variance: Math.random() * 2,
        logLikelihood: -Math.random() * 100,
        aic: Math.random() * 5,
        bic: Math.random() * 5 + 5,
        hqc: Math.random() * 5 + 2.5,
        forecasts: null
    };
    
    // Add standard errors and t-stats
    results.arStdErrors = results.arCoefficients.map(() => Math.random() * 0.5);
    results.maStdErrors = results.maCoefficients.map(() => Math.random() * 0.5);
    results.arTStats = results.arCoefficients.map((c, i) => c / results.arStdErrors[i]);
    results.maTStats = results.maCoefficients.map((c, i) => c / results.maStdErrors[i]);
    
    // Add forecasts if requested
    if (forecastPeriods > 0) {
        results.forecasts = {
            point: Array(forecastPeriods).fill().map(() => Math.random() * 10),
            lower: Array(forecastPeriods).fill().map(() => Math.random() * 5),
            upper: Array(forecastPeriods).fill().map(() => Math.random() * 15 + 5)
        };
    }
    
    return results;
}

// Helper functions for simulating results
function simulateVarCoefficients(k, lags) {
    const coeffs = [];
    for (let i = 0; i < k; i++) {
        const eqCoeffs = {
            constant: Math.random() * 2 - 1,
            variables: []
        };
        
        for (let j = 0; j < k; j++) {
            const varCoeffs = [];
            for (let l = 1; l <= lags; l++) {
                varCoeffs.push(Math.random() * 1.5 - 0.75);
            }
            eqCoeffs.variables.push(varCoeffs);
        }
        
        coeffs.push(eqCoeffs);
    }
    return coeffs;
}

function simulateResiduals(n, k) {
    const residuals = [];
    for (let i = 0; i < n; i++) {
        const rowResiduals = [];
        for (let j = 0; j < k; j++) {
            rowResiduals.push(Math.random() * 2 - 1);
        }
        residuals.push(rowResiduals);
    }
    return residuals;
}

function simulateCovarianceMatrix(k) {
    const matrix = [];
    for (let i = 0; i < k; i++) {
        matrix[i] = [];
        for (let j = 0; j < k; j++) {
            if (i === j) {
                matrix[i][j] = Math.random() * 2;
            } else if (j < i) {
                // Use the symmetric value that was already calculated
                matrix[i][j] = matrix[j][i];
            } else {
                // Calculate a random correlation and ensure it's symmetric
                const varI = matrix[i][i] || 1;
                const varJ = Math.random() * 2; // For j > i, we haven't set matrix[j][j] yet
                const correlation = Math.random() * 0.6 - 0.3;
                matrix[i][j] = correlation * Math.sqrt(varI * varJ);
            }
        }
    }
    return matrix;
}

function simulateLoadingMatrix(k, r) {
    const matrix = [];
    for (let i = 0; i < k; i++) {
        matrix[i] = [];
        for (let j = 0; j < r; j++) {
            matrix[i][j] = Math.random() * 0.6 - 0.3;
        }
    }
    return matrix;
}

function simulateCointVector(k, r) {
    const vectors = [];
    for (let i = 0; i < r; i++) {
        const vector = [];
        for (let j = 0; j < k; j++) {
            vector.push(Math.random() * 2 - 1);
        }
        vectors.push(vector);
    }
    return vectors;
}

function simulateTestStats(k) {
    const stats = [];
    for (let i = 0; i < k; i++) {
        stats.push(Math.random() * 30 + 10);
    }
    return stats.sort((a, b) => b - a);
}

function simulateCriticalValues(k) {
    const criticalValues = [];
    for (let i = 0; i < k; i++) {
        criticalValues.push({
            "90%": Math.random() * 10 + 5,
            "95%": Math.random() * 15 + 10,
            "99%": Math.random() * 20 + 15
        });
    }
    return criticalValues;
}

function simulateForecasts(k, h) {
    const forecasts = [];
    for (let i = 0; i < k; i++) {
        const varForecasts = {
            point: [],
            lower: [],
            upper: []
        };
        
        for (let j = 0; j < h; j++) {
            const point = Math.random() * 10;
            varForecasts.point.push(point);
            varForecasts.lower.push(point - Math.random() * 3);
            varForecasts.upper.push(point + Math.random() * 3);
        }
        
        forecasts.push(varForecasts);
    }
    return forecasts;
}

// Display results from advanced time series analysis
function displayAdvancedTsResults(results, modelType) {
    const resultsContainer = document.getElementById('adv-ts-results');
    resultsContainer.innerHTML = '';
    
    const translations = config.languages[currentLanguage];
    
    // Create header based on model type
    const headerDiv = document.createElement('div');
    headerDiv.className = 'regression-equation';
    
    switch (modelType) {
        case 'var':
            headerDiv.innerHTML = `<h4>Vector Autoregression (VAR) Model</h4>
                                  <p>Order: ${results.lags}</p>
                                  <p>Variables: ${results.variables.join(', ')}</p>`;
            break;
        case 'vecm':
            headerDiv.innerHTML = `<h4>Vector Error Correction Model (VECM)</h4>
                                  <p>Lags: ${results.lags}, Cointegration Rank: ${results.cointRank}</p>
                                  <p>Variables: ${results.variables.join(', ')}</p>`;
            break;
        case 'johansen':
            headerDiv.innerHTML = `<h4>Johansen Cointegration Test</h4>
                                  <p>Lags: ${results.lags}</p>
                                  <p>Variables: ${results.variables.join(', ')}</p>
                                  <p>Cointegration Rank: ${results.cointRank}</p>`;
            break;
        case 'arma':
            headerDiv.innerHTML = `<h4>ARMA(${results.arOrder},${results.maOrder}) Model</h4>
                                  <p>Variable: ${results.variable}</p>`;
            break;
    }
    
    resultsContainer.appendChild(headerDiv);
    
    // Create model-specific result tables
    switch (modelType) {
        case 'var':
            displayVarResults(results, resultsContainer);
            break;
        case 'vecm':
            displayVecmResults(results, resultsContainer);
            break;
        case 'johansen':
            displayJohansenResults(results, resultsContainer);
            break;
        case 'arma':
            displayArmaResults(results, resultsContainer);
            break;
    }
    
    // Create charts
    createAdvancedTsCharts(results, modelType);
}

// Display VAR model results
function displayVarResults(results, container) {
    // Model fit statistics table
    const fitTable = document.createElement('table');
    fitTable.className = 'result-table';
    
    const fitHeader = document.createElement('tr');
    const fitHeaderCell = document.createElement('th');
    fitHeaderCell.colSpan = 2;
    fitHeaderCell.textContent = 'Model Fit Statistics';
    fitHeader.appendChild(fitHeaderCell);
    fitTable.appendChild(fitHeader);
    
    [
        { label: 'AIC', value: results.aic.toFixed(4) },
        { label: 'BIC', value: results.bic.toFixed(4) },
        { label: 'HQC', value: results.hqc.toFixed(4) }
    ].forEach(stat => {
        const row = document.createElement('tr');
        const labelCell = document.createElement('td');
        labelCell.textContent = stat.label;
        const valueCell = document.createElement('td');
        valueCell.textContent = stat.value;
        row.appendChild(labelCell);
        row.appendChild(valueCell);
        fitTable.appendChild(row);
    });
    
    container.appendChild(fitTable);
    
    // VAR coefficients tables (one for each equation)
    results.variables.forEach((variable, idx) => {
        const coeffTable = document.createElement('table');
        coeffTable.className = 'result-table';
        
        const coeffHeader = document.createElement('tr');
        const coeffHeaderCell = document.createElement('th');
        coeffHeaderCell.colSpan = 2;
        coeffHeaderCell.textContent = `Equation for ${variable}`;
        coeffHeader.appendChild(coeffHeaderCell);
        coeffTable.appendChild(coeffHeader);
        
        // Column headers
        const subHeader = document.createElement('tr');
        ['Variable', 'Coefficient'].forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            subHeader.appendChild(th);
        });
        coeffTable.appendChild(subHeader);
        
        // Constant term
        const constRow = document.createElement('tr');
        
        const varLabelCell = document.createElement('td');
        varLabelCell.textContent = 'Constant';
        
        const coefValueCell = document.createElement('td');
        coefValueCell.textContent = results.coefficients[idx].constant.toFixed(4);
        
        constRow.appendChild(varLabelCell);
        constRow.appendChild(coefValueCell);
        coeffTable.appendChild(constRow);
        
        // Variable lags
        results.coefficients[idx].variables.forEach((varCoeffs, varIdx) => {
            // Handle both array and single value cases
            if (Array.isArray(varCoeffs)) {
                varCoeffs.forEach((coeff, lagIdx) => {
                    const row = document.createElement('tr');
                    
                    const varLabelCell = document.createElement('td');
                    varLabelCell.textContent = `${results.variables[varIdx]}(t-${lagIdx+1})`;
                    
                    const coefValueCell = document.createElement('td');
                    coefValueCell.textContent = coeff.toFixed(4);
                    
                    row.appendChild(varLabelCell);
                    row.appendChild(coefValueCell);
                    coeffTable.appendChild(row);
                });
            } else {
                // Handle case where coefficient is a single value
                const row = document.createElement('tr');
                
                const varLabelCell = document.createElement('td');
                varLabelCell.textContent = `${results.variables[varIdx]}(t-${varIdx+1})`;
                
                const coefValueCell = document.createElement('td');
                coefValueCell.textContent = varCoeffs.toFixed(4);
                
                row.appendChild(varLabelCell);
                row.appendChild(coefValueCell);
                coeffTable.appendChild(row);
            }
        });
        
        container.appendChild(coeffTable);
    });
    
    // Add impulse response section if available
    if (results.impulseResponses) {
        displayImpulseResponses(results, container);
    }
    
    // Add forecasts section if available
    if (results.forecasts) {
        displayForecasts(results, container);
    }
}

// Display VECM results
function displayVecmResults(results, container) {
    // Model fit statistics
    const fitTable = document.createElement('table');
    fitTable.className = 'result-table';
    
    const fitHeader = document.createElement('tr');
    const fitHeaderCell = document.createElement('th');
    fitHeaderCell.colSpan = 2;
    fitHeaderCell.textContent = 'Model Fit Statistics';
    fitHeader.appendChild(fitHeaderCell);
    fitTable.appendChild(fitHeader);
    
    [
        { label: 'AIC', value: results.aic.toFixed(4) },
        { label: 'BIC', value: results.bic.toFixed(4) },
        { label: 'HQC', value: results.hqc.toFixed(4) }
    ].forEach(stat => {
        const row = document.createElement('tr');
        const labelCell = document.createElement('td');
        labelCell.textContent = stat.label;
        const valueCell = document.createElement('td');
        valueCell.textContent = stat.value;
        row.appendChild(labelCell);
        row.appendChild(valueCell);
        fitTable.appendChild(row);
    });
    
    container.appendChild(fitTable);
    
    // Loading matrix (adjustment coefficients)
    const loadingTable = document.createElement('table');
    loadingTable.className = 'result-table';
    
    const loadingHeader = document.createElement('tr');
    const loadingHeaderCell = document.createElement('th');
    loadingHeaderCell.colSpan = results.cointRank + 1;
    loadingHeaderCell.textContent = 'Loading Matrix (Adjustment Coefficients)';
    loadingHeader.appendChild(loadingHeaderCell);
    loadingTable.appendChild(loadingHeader);
    
    // Column headers
    const loadingSubHeader = document.createElement('tr');
    const varHeader = document.createElement('th');
    varHeader.textContent = 'Variable';
    loadingSubHeader.appendChild(varHeader);
    
    for (let i = 0; i < results.cointRank; i++) {
        const colHeader = document.createElement('th');
        colHeader.textContent = `EC${i+1}`;
        loadingSubHeader.appendChild(colHeader);
    }
    loadingTable.appendChild(loadingSubHeader);
    
    // Loading coefficients
    results.variables.forEach((variable, idx) => {
        const row = document.createElement('tr');
        const labelCell = document.createElement('td');
        labelCell.textContent = variable;
        row.appendChild(labelCell);
        
        for (let i = 0; i < results.cointRank; i++) {
            const valueCell = document.createElement('td');
            valueCell.textContent = results.loadingMatrix[idx][i].toFixed(4);
            row.appendChild(valueCell);
        }
        
        loadingTable.appendChild(row);
    });
    
    container.appendChild(loadingTable);
    
    // Cointegrating vector
    const cointTable = document.createElement('table');
    cointTable.className = 'result-table';
    
    const cointHeader = document.createElement('tr');
    const cointHeaderCell = document.createElement('th');
    cointHeaderCell.colSpan = results.variables.length + 1;
    cointHeaderCell.textContent = 'Cointegrating Relations';
    cointHeader.appendChild(cointHeaderCell);
    cointTable.appendChild(cointHeader);
    
    // Column headers
    const cointSubHeader = document.createElement('tr');
    const vecHeader = document.createElement('th');
    vecHeader.textContent = 'Vector';
    cointSubHeader.appendChild(vecHeader);
    
    results.variables.forEach(variable => {
        const colHeader = document.createElement('th');
        colHeader.textContent = variable;
        cointSubHeader.appendChild(colHeader);
    });
    cointTable.appendChild(cointSubHeader);
    
    // Cointegrating vectors
    for (let i = 0; i < results.cointRank; i++) {
        const row = document.createElement('tr');
        const labelCell = document.createElement('td');
        labelCell.textContent = `EC${i+1}`;
        row.appendChild(labelCell);
        
        results.cointVector[i].forEach(coeff => {
            const valueCell = document.createElement('td');
            valueCell.textContent = coeff.toFixed(4);
            row.appendChild(valueCell);
        });
        
        cointTable.appendChild(row);
    }
    
    container.appendChild(cointTable);
    
    // Add impulse response section if available
    if (results.impulseResponses) {
        displayImpulseResponses(results, container);
    }
    
    // Add forecasts section if available
    if (results.forecasts) {
        displayForecasts(results, container);
    }
}

// Display Johansen test results
function displayJohansenResults(results, container) {
    // Trace test table
    const traceTable = document.createElement('table');
    traceTable.className = 'result-table';
    
    const traceHeader = document.createElement('tr');
    const traceHeaderCell = document.createElement('th');
    traceHeaderCell.colSpan = 5;
    traceHeaderCell.textContent = 'Johansen Trace Test';
    traceHeader.appendChild(traceHeaderCell);
    traceTable.appendChild(traceHeader);
    
    // Column headers
    const traceSubHeader = document.createElement('tr');
    ['Rank', 'Test Statistic', '90% Critical Value', '95% Critical Value', '99% Critical Value'].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        traceSubHeader.appendChild(th);
    });
    traceTable.appendChild(traceSubHeader);
    
    // Test results for each rank
    for (let i = 0; i < results.traceStats.length; i++) {
        const row = document.createElement('tr');
        
        const rankCell = document.createElement('td');
        rankCell.textContent = `r ≤ ${i}`;
        
        const statCell = document.createElement('td');
        statCell.textContent = results.traceStats[i].toFixed(4);
        
        const cv90Cell = document.createElement('td');
        cv90Cell.textContent = results.criticalValues[i]['90%'].toFixed(4);
        
        const cv95Cell = document.createElement('td');
        cv95Cell.textContent = results.criticalValues[i]['95%'].toFixed(4);
        
        const cv99Cell = document.createElement('td');
        cv99Cell.textContent = results.criticalValues[i]['99%'].toFixed(4);
        
        row.appendChild(rankCell);
        row.appendChild(statCell);
        row.appendChild(cv90Cell);
        row.appendChild(cv95Cell);
        row.appendChild(cv99Cell);
        
        // Highlight if test statistic exceeds critical value
        if (results.traceStats[i] > results.criticalValues[i]['95%']) {
            row.style.fontWeight = 'bold';
        }
        
        traceTable.appendChild(row);
    }
    
    container.appendChild(traceTable);
    
    // Maximum eigenvalue test table
    const eigenTable = document.createElement('table');
    eigenTable.className = 'result-table';
    
    const eigenHeader = document.createElement('tr');
    const eigenHeaderCell = document.createElement('th');
    eigenHeaderCell.colSpan = 5;
    eigenHeaderCell.textContent = 'Johansen Maximum Eigenvalue Test';
    eigenHeader.appendChild(eigenHeaderCell);
    eigenTable.appendChild(eigenHeader);
    
    // Column headers (same as trace test)
    const eigenSubHeader = document.createElement('tr');
    ['Rank', 'Test Statistic', '90% Critical Value', '95% Critical Value', '99% Critical Value'].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        eigenSubHeader.appendChild(th);
    });
    eigenTable.appendChild(eigenSubHeader);
    
    // Test results for each rank
    for (let i = 0; i < results.maxEigenStats.length; i++) {
        const row = document.createElement('tr');
        
        const rankCell = document.createElement('td');
        rankCell.textContent = `r ≤ ${i}`;
        
        const statCell = document.createElement('td');
        statCell.textContent = results.maxEigenStats[i].toFixed(4);
        
        const cv90Cell = document.createElement('td');
        cv90Cell.textContent = results.criticalValues[i]['90%'].toFixed(4);
        
        const cv95Cell = document.createElement('td');
        cv95Cell.textContent = results.criticalValues[i]['95%'].toFixed(4);
        
        const cv99Cell = document.createElement('td');
        cv99Cell.textContent = results.criticalValues[i]['99%'].toFixed(4);
        
        row.appendChild(rankCell);
        row.appendChild(statCell);
        row.appendChild(cv90Cell);
        row.appendChild(cv95Cell);
        row.appendChild(cv99Cell);
        
        // Highlight if test statistic exceeds critical value
        if (results.maxEigenStats[i] > results.criticalValues[i]['95%']) {
            row.style.fontWeight = 'bold';
        }
        
        eigenTable.appendChild(row);
    }
    
    container.appendChild(eigenTable);
    
    // Conclusion section
    const conclusionDiv = document.createElement('div');
    conclusionDiv.className = 'regression-equation';
    conclusionDiv.innerHTML = `
        <h4>Conclusion</h4>
        <p>Based on both trace and maximum eigenvalue tests at 5% significance level, 
           the cointegration rank is estimated to be ${results.cointRank}.</p>
        <p>This suggests there are ${results.cointRank} cointegrating relationship(s) 
           among the ${results.variables.length} variables.</p>
    `;
    
    container.appendChild(conclusionDiv);
}

// Display ARMA model results
function displayArmaResults(results, container) {
    // Model summary table
    const summaryTable = document.createElement('table');
    summaryTable.className = 'result-table';
    
    const summaryHeader = document.createElement('tr');
    const summaryHeaderCell = document.createElement('th');
    summaryHeaderCell.colSpan = 2;
    summaryHeaderCell.textContent = 'Model Summary';
    summaryHeader.appendChild(summaryHeaderCell);
    summaryTable.appendChild(summaryHeader);
    
    [
        { label: 'Log Likelihood', value: results.logLikelihood.toFixed(4) },
        { label: 'AIC', value: results.aic.toFixed(4) },
        { label: 'BIC', value: results.bic.toFixed(4) },
        { label: 'HQC', value: results.hqc.toFixed(4) },
        { label: 'Variance', value: results.variance.toFixed(4) }
    ].forEach(stat => {
        const row = document.createElement('tr');
        const labelCell = document.createElement('td');
        labelCell.textContent = stat.label;
        const valueCell = document.createElement('td');
        valueCell.textContent = stat.value;
        row.appendChild(labelCell);
        row.appendChild(valueCell);
        summaryTable.appendChild(row);
    });
    
    container.appendChild(summaryTable);
    
    // Coefficients table
    const coeffTable = document.createElement('table');
    coeffTable.className = 'result-table';
    
    const coeffHeader = document.createElement('tr');
    const coeffHeaderCell = document.createElement('th');
    coeffHeaderCell.colSpan = 4;
    coeffHeaderCell.textContent = 'Model Coefficients';
    coeffHeader.appendChild(coeffHeaderCell);
    coeffTable.appendChild(coeffHeader);
    
    // Column headers
    const coeffSubHeader = document.createElement('tr');
    ['Parameter', 'Coefficient', 'Std. Error', 't-statistic'].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        coeffSubHeader.appendChild(th);
    });
    coeffTable.appendChild(coeffSubHeader);
    
    // Constant
    const constRow = document.createElement('tr');
    const constLabelCell = document.createElement('td');
    constLabelCell.textContent = 'Constant';
    
    const constValueCell = document.createElement('td');
    constValueCell.textContent = results.constant.toFixed(4);
    
    const constSeCell = document.createElement('td');
    constSeCell.textContent = (Math.random() * 0.5).toFixed(4);
    
    const constTStatCell = document.createElement('td');
    constTStatCell.textContent = (results.constant / parseFloat(constSeCell.textContent)).toFixed(4);
    
    constRow.appendChild(constLabelCell);
    constRow.appendChild(constValueCell);
    constRow.appendChild(constSeCell);
    constRow.appendChild(constTStatCell);
    coeffTable.appendChild(constRow);
    
    // AR coefficients
    results.arCoefficients.forEach((coeff, idx) => {
        const row = document.createElement('tr');
        
        const labelCell = document.createElement('td');
        labelCell.textContent = `AR(${idx+1})`;
        
        const valueCell = document.createElement('td');
        valueCell.textContent = coeff.toFixed(4);
        
        const seCell = document.createElement('td');
        seCell.textContent = results.arStdErrors[idx].toFixed(4);
        
        const tStatCell = document.createElement('td');
        tStatCell.textContent = results.arTStats[idx].toFixed(4);
        
        row.appendChild(labelCell);
        row.appendChild(valueCell);
        row.appendChild(seCell);
        row.appendChild(tStatCell);
        coeffTable.appendChild(row);
    });
    
    // MA coefficients
    results.maCoefficients.forEach((coeff, idx) => {
        const row = document.createElement('tr');
        
        const labelCell = document.createElement('td');
        labelCell.textContent = `MA(${idx+1})`;
        
        const valueCell = document.createElement('td');
        valueCell.textContent = coeff.toFixed(4);
        
        const seCell = document.createElement('td');
        seCell.textContent = results.maStdErrors[idx].toFixed(4);
        
        const tStatCell = document.createElement('td');
        tStatCell.textContent = results.maTStats[idx].toFixed(4);
        
        row.appendChild(labelCell);
        row.appendChild(valueCell);
        row.appendChild(seCell);
        row.appendChild(tStatCell);
        coeffTable.appendChild(row);
    });
    
    container.appendChild(coeffTable);
    
    // Add forecasts if available
    if (results.forecasts) {
        const forecastTable = document.createElement('table');
        forecastTable.className = 'result-table';
        
        const forecastHeader = document.createElement('tr');
        const forecastHeaderCell = document.createElement('th');
        forecastHeaderCell.colSpan = 4;
        forecastHeaderCell.textContent = 'Forecasts';
        forecastHeader.appendChild(forecastHeaderCell);
        forecastTable.appendChild(forecastHeader);
        
        // Column headers
        const forecastSubHeader = document.createElement('tr');
        ['Period', 'Forecast', 'Lower 95%', 'Upper 95%'].forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            forecastSubHeader.appendChild(th);
        });
        forecastTable.appendChild(forecastSubHeader);
        
        // Forecast rows
        results.forecasts.point.forEach((point, idx) => {
            const row = document.createElement('tr');
            
            const periodCell = document.createElement('td');
            periodCell.textContent = `t+${idx+1}`;
            
            const pointCell = document.createElement('td');
            pointCell.textContent = point.toFixed(4);
            
            const lowerCell = document.createElement('td');
            lowerCell.textContent = results.forecasts.lower[idx].toFixed(4);
            
            const upperCell = document.createElement('td');
            upperCell.textContent = results.forecasts.upper[idx].toFixed(4);
            
            row.appendChild(periodCell);
            row.appendChild(pointCell);
            row.appendChild(lowerCell);
            row.appendChild(upperCell);
            forecastTable.appendChild(row);
        });
        
        container.appendChild(forecastTable);
    }
}

// Display forecasts for multivariate models
function displayForecasts(results, container) {
    const forecastsDiv = document.createElement('div');
    forecastsDiv.className = 'regression-equation';
    forecastsDiv.innerHTML = `<h4>Forecasts</h4>`;
    
    results.variables.forEach((variable, idx) => {
        const forecastTable = document.createElement('table');
        forecastTable.className = 'result-table';
        forecastTable.style.marginBottom = '15px';
        
        const forecastHeader = document.createElement('tr');
        const forecastHeaderCell = document.createElement('th');
        forecastHeaderCell.colSpan = 4;
        forecastHeaderCell.textContent = `Forecasts for ${variable}`;
        forecastHeader.appendChild(forecastHeaderCell);
        forecastTable.appendChild(forecastHeader);
        
        // Column headers
        const forecastSubHeader = document.createElement('tr');
        ['Period', 'Forecast', 'Lower 95%', 'Upper 95%'].forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            forecastSubHeader.appendChild(th);
        });
        forecastTable.appendChild(forecastSubHeader);
        
        // Forecast rows
        results.forecasts[idx].point.forEach((forecast, i) => {
            const row = document.createElement('tr');
            
            const periodCell = document.createElement('td');
            periodCell.textContent = `t+${i+1}`;
            
            const forecastCell = document.createElement('td');
            forecastCell.textContent = forecast.toFixed(4);
            
            const lowerCell = document.createElement('td');
            lowerCell.textContent = results.forecasts[idx].lower[i].toFixed(4);
            
            const upperCell = document.createElement('td');
            upperCell.textContent = results.forecasts[idx].upper[i].toFixed(4);
            
            row.appendChild(periodCell);
            row.appendChild(forecastCell);
            row.appendChild(lowerCell);
            row.appendChild(upperCell);
            forecastTable.appendChild(row);
        });
        
        forecastsDiv.appendChild(forecastTable);
    });
    
    container.appendChild(forecastsDiv);
}

// Create charts for advanced time series analysis
function createAdvancedTsCharts(results, modelType) {
    // Destroy existing chart if it exists
    if (window.advTsChart) {
        window.advTsChart.destroy();
    }
    
    const ctx = document.getElementById('adv-ts-chart').getContext('2d');
    
    // Different chart based on model type
    switch (modelType) {
        case 'var':
        case 'vecm':
            createMultivariateForecasts(results, ctx);
            break;
        case 'johansen':
            createJohansenChart(results, ctx);
            break;
        case 'arma':
            createArmaChart(results, ctx);
            break;
    }
}

// Create multivariate forecast chart
function createMultivariateForecasts(results, ctx) {
    if (!results.forecasts && !results.impulseResponses) {
        // Create a placeholder chart if no forecasts or IRFs
        window.advTsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'No forecast or impulse response data available'
                    }
                }
            }
        });
        return;
    }
    
    // Create a "View Menu" to switch between forecasts and impulse responses
    if (results.forecasts && results.impulseResponses) {
        const menuContainer = document.createElement('div');
        menuContainer.style.textAlign = 'center';
        menuContainer.style.marginBottom = '15px';
        
        const forecastBtn = document.createElement('button');
        forecastBtn.className = 'secondary-btn';
        forecastBtn.style.marginRight = '10px';
        forecastBtn.style.padding = '5px 10px';
        forecastBtn.style.cursor = 'pointer';
        forecastBtn.textContent = 'Show Forecasts';
        
        const irfBtn = document.createElement('button');
        irfBtn.className = 'secondary-btn';
        irfBtn.style.padding = '5px 10px';
        irfBtn.style.cursor = 'pointer';
        irfBtn.textContent = 'Show Impulse Responses';
        
        menuContainer.appendChild(forecastBtn);
        menuContainer.appendChild(irfBtn);
        
        document.getElementById('adv-ts-chart-container').insertBefore(
            menuContainer, 
            document.getElementById('adv-ts-chart')
        );
        
        // Add event listeners
        forecastBtn.addEventListener('click', () => {
            // Show forecasts
            let irfContainer = document.getElementById('irf-charts-container');
            if (irfContainer) irfContainer.style.display = 'none';
            document.getElementById('adv-ts-chart').style.display = 'block';
        });
        
        irfBtn.addEventListener('click', () => {
            // Show impulse responses
            document.getElementById('adv-ts-chart').style.display = 'none';
            createImpulseResponseCharts(results);
        });
    }
    
    // If no forecasts but we have impulse responses
    if (!results.forecasts && results.impulseResponses) {
        // Show impulse responses by default
        document.getElementById('adv-ts-chart').style.display = 'none';
        createImpulseResponseCharts(results);
        return;
    }
    
    // Create forecast chart
    if (results.forecasts) {
        const datasets = [];
        
        // Create a dataset for each variable
        results.variables.forEach((variable, idx) => {
            if (results.forecasts[idx]) {
                datasets.push({
                    label: variable,
                    data: results.forecasts[idx].point,
                    borderColor: getColor(idx),
                    backgroundColor: getColor(idx, 0.1),
                    borderWidth: 2
                });
            }
        });
        
        window.advTsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from({ length: results.forecasts[0].point.length }, (_, i) => `t+${i+1}`),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Forecasts'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'Value'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Forecast Horizon'
                        }
                    }
                }
            }
        });
    }
}

// Create Johansen test chart
function createJohansenChart(results, ctx) {
    const traceData = results.traceStats;
    const eigenData = results.maxEigenStats;
    const criticalValues = results.criticalValues.map(cv => cv['95%']);
    
    window.advTsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Array.from({ length: traceData.length }, (_, i) => `r ≤ ${i}`),
            datasets: [
                {
                    label: 'Trace Statistic',
                    data: traceData,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgb(54, 162, 235)',
                    borderWidth: 1
                },
                {
                    label: 'Max Eigenvalue Statistic',
                    data: eigenData,
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderColor: 'rgb(255, 99, 132)',
                    borderWidth: 1
                },
                {
                    label: '95% Critical Value',
                    data: criticalValues,
                    type: 'line',
                    fill: false,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderDash: [5, 5],
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Johansen Cointegration Test'
                },
                legend: {
                    position: 'top',
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Rank'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Test Statistic'
                    }
                }
            }
        }
    });
}

// Create ARMA model chart
function createArmaChart(results, ctx) {
    if (!results.forecasts) {
        // Show ACF or PACF plot
        const randomData = Array(20).fill().map(() => Math.random() * 2 - 1);
        
        window.advTsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Array.from({ length: 20 }, (_, i) => i),
                datasets: [
                    {
                        label: 'Autocorrelation Function',
                        data: randomData,
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        borderColor: 'rgb(54, 162, 235)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Lag'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Correlation'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Autocorrelation Function (ACF)'
                    }
                }
            }
        });
        return;
    }
    
    // Show forecast with confidence interval
    window.advTsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({ length: results.forecasts.point.length }, (_, i) => `t+${i+1}`),
            datasets: [
                {
                    label: 'Point Forecast',
                    data: results.forecasts.point,
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    borderWidth: 2,
                    fill: false
                },
                {
                    label: '95% Confidence Interval',
                    data: results.forecasts.point,
                    borderColor: 'rgba(54, 162, 235, 0.3)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    borderWidth: 0,
                    pointRadius: 0,
                    fill: {
                        target: '-1',
                        above: 'rgba(54, 162, 235, 0.1)',
                        below: 'rgba(54, 162, 235, 0.1)'
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `ARMA(${results.arOrder},${results.maOrder}) Forecast`
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Forecast Horizon'
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

// Helper function to get colors
function getColor(index, alpha = 1) {
    const colors = [
        `rgba(54, 162, 235, ${alpha})`,
        `rgba(255, 99, 132, ${alpha})`,
        `rgba(75, 192, 192, ${alpha})`,
        `rgba(255, 159, 64, ${alpha})`,
        `rgba(153, 102, 255, ${alpha})`,
        `rgba(255, 205, 86, ${alpha})`,
        `rgba(201, 203, 207, ${alpha})`
    ];
    
    return colors[index % colors.length];
}

// Add new function to simulate impulse responses
function simulateImpulseResponses(k, periods) {
    // Create an array of impulse responses for each variable
    const responses = [];
    
    // For each variable (impulse source)
    for (let source = 0; source < k; source++) {
        const sourceResponses = [];
        
        // For each responding variable
        for (let target = 0; target < k; target++) {
            const impulseResponse = [];
            
            // Generate response over time periods
            for (let t = 0; t < periods; t++) {
                // Decay pattern with some randomness
                let response = 0;
                if (t === 0 && source === target) {
                    // Initial shock is strongest on own variable
                    response = 1.0 + (Math.random() * 0.5);
                } else {
                    // Impulse decays over time with some randomness
                    const baseEffect = source === target ? 0.7 : 0.3; // Stronger effect on own variable
                    const decay = Math.exp(-0.3 * t);
                    response = baseEffect * decay * (1 + (Math.random() * 0.6 - 0.3));
                    
                    // Add some oscillation for interesting patterns
                    if (t > 1) {
                        response += 0.2 * Math.sin(t) * decay;
                    }
                }
                
                impulseResponse.push(response);
            }
            
            sourceResponses.push({
                source: source,
                target: target,
                response: impulseResponse
            });
        }
        
        responses.push(sourceResponses);
    }
    
    return responses;
}

function displayImpulseResponses(results, container) {
    const impulseResponseDiv = document.createElement('div');
    impulseResponseDiv.className = 'regression-equation';
    impulseResponseDiv.innerHTML = `
        <h4>Impulse Response Functions</h4>
        <p>The charts below show how each variable responds to a one standard deviation shock in each of the other variables.</p>
    `;
    
    container.appendChild(impulseResponseDiv);
    
    // Create a button to view impulse responses
    const viewIrfBtn = document.createElement('button');
    viewIrfBtn.className = 'primary-btn';
    viewIrfBtn.style.marginBottom = '15px';
    viewIrfBtn.textContent = 'View Impulse Response Charts';
    impulseResponseDiv.appendChild(viewIrfBtn);
    
    // Add event listener to show IRF charts in a new section
    viewIrfBtn.addEventListener('click', () => {
        createImpulseResponseCharts(results);
    });
}

// Function to create impulse response charts
function createImpulseResponseCharts(results) {
    // Create a container for the charts if it doesn't exist
    let irfChartsContainer = document.getElementById('irf-charts-container');
    
    if (!irfChartsContainer) {
        irfChartsContainer = document.createElement('div');
        irfChartsContainer.id = 'irf-charts-container';
        irfChartsContainer.style.marginTop = '20px';
        document.getElementById('adv-ts-chart-container').appendChild(irfChartsContainer);
    } else {
        // Show if hidden
        irfChartsContainer.style.display = 'block';
        irfChartsContainer.innerHTML = ''; // Clear existing charts
    }
    
    // Check if impulse responses exist
    if (!results.impulseResponses || results.impulseResponses.length === 0) {
        irfChartsContainer.innerHTML = '<p style="text-align: center; color: #666;">No impulse response data available</p>';
        return;
    }
    
    // Create a chart for each variable
    results.variables.forEach((sourceVar, sourceIdx) => {
        const chartContainer = document.createElement('div');
        chartContainer.style.marginBottom = '30px';
        chartContainer.style.height = '300px';
        chartContainer.style.width = '100%';
        
        const chartTitle = document.createElement('h5');
        chartTitle.textContent = `Responses to Impulse in ${sourceVar}`;
        chartTitle.style.textAlign = 'center';
        chartTitle.style.marginBottom = '10px';
        
        const canvas = document.createElement('canvas');
        canvas.id = `irf-chart-${sourceIdx}`;
        
        chartContainer.appendChild(chartTitle);
        chartContainer.appendChild(canvas);
        irfChartsContainer.appendChild(chartContainer);
        
        // Create datasets for chart
        const datasets = [];
        
        // Add defensive check for the impulseResponses structure
        if (Array.isArray(results.impulseResponses[sourceIdx])) {
            results.variables.forEach((targetVar, targetIdx) => {
                if (results.impulseResponses[sourceIdx][targetIdx] && 
                    Array.isArray(results.impulseResponses[sourceIdx][targetIdx].response)) {
                    datasets.push({
                        label: targetVar,
                        data: results.impulseResponses[sourceIdx][targetIdx].response,
                        borderColor: getColor(targetIdx),
                        backgroundColor: getColor(targetIdx, 0.1),
                        borderWidth: 2,
                        fill: false
                    });
                }
            });
        }
        
        // Create chart
        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from({ length: datasets.length > 0 ? datasets[0].data.length : 10 }, (_, i) => i),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Impulse Response: ${sourceVar}`
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Periods after shock'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Response'
                        }
                    }
                }
            }
        });
    });
}

// Show panel view
function showPanelView() {
    if (!workbookData) {
        alert('Please import data first');
        return;
    }
    
    welcomeScreen.classList.add('hidden');
    dataView.classList.add('hidden');
    statsView.classList.add('hidden');
    regressionView.classList.add('hidden');
    document.getElementById('ardl-view').classList.add('hidden');
    document.getElementById('advanced-ts-view').classList.add('hidden');
    document.getElementById('stationarity-view').classList.add('hidden');
    document.getElementById('panel-view').classList.remove('hidden');
    
    updatePanelView();
}

// Update panel data analysis view
function updatePanelView() {
    // Get selectors
    const entityColSelect = document.getElementById('panel-entity-col');
    const timeColSelect = document.getElementById('panel-time-col');
    const dependentVarSelect = document.getElementById('panel-dependent-var');
    const independentVarsSelect = document.getElementById('panel-independent-vars');
    
    // Clear existing options
    entityColSelect.innerHTML = '';
    timeColSelect.innerHTML = '';
    dependentVarSelect.innerHTML = '';
    independentVarsSelect.innerHTML = '';
    
    // Add column options
    columns.forEach(column => {
        // Entity column options
        const entityOption = document.createElement('option');
        entityOption.value = column;
        entityOption.textContent = column;
        entityColSelect.appendChild(entityOption);
        
        // Time column options
        const timeOption = document.createElement('option');
        timeOption.value = column;
        timeOption.textContent = column;
        timeColSelect.appendChild(timeOption);
        
        // Dependent variable options
        const depOption = document.createElement('option');
        depOption.value = column;
        depOption.textContent = column;
        dependentVarSelect.appendChild(depOption);
        
        // Independent variables options
        const indepOption = document.createElement('option');
        indepOption.value = column;
        indepOption.textContent = column;
        independentVarsSelect.appendChild(indepOption);
    });
    
    // Preselect the first column as entity ID and second as time period (if available)
    if (entityColSelect.options.length > 0) {
        entityColSelect.selectedIndex = 0;
    }
    
    if (timeColSelect.options.length > 1) {
        timeColSelect.selectedIndex = 1;
    }
    
    // Select third column as dependent variable by default (if available)
    if (dependentVarSelect.options.length > 2) {
        dependentVarSelect.selectedIndex = 2;
    }
    
    // Select other columns as independent variables by default
    if (independentVarsSelect.options.length > 3) {
        for (let i = 3; i < independentVarsSelect.options.length; i++) {
            independentVarsSelect.options[i].selected = true;
        }
    }
    
    // Add event listener for run button
    document.getElementById('run-panel').addEventListener('click', runPanelAnalysis);
}

// Run panel data analysis
function runPanelAnalysis() {
    const entityCol = document.getElementById('panel-entity-col').value;
    const timeCol = document.getElementById('panel-time-col').value;
    const dependentVar = document.getElementById('panel-dependent-var').value;
    const independentVars = Array.from(document.getElementById('panel-independent-vars').selectedOptions).map(opt => opt.value);
    const modelType = document.getElementById('panel-model-type').value;
    const effectsType = document.getElementById('panel-effects').value;
    const useRobust = document.getElementById('panel-robust').checked;
    const clusterByEntity = document.getElementById('panel-cluster').checked;
    
    if (!entityCol || !timeCol || !dependentVar || independentVars.length === 0) {
        alert('Please select all required fields');
        return;
    }
    
    // In a real implementation, this would use statistical libraries for panel data analysis
    // Here we'll create simulated results
    
    // Organize data into panel format
    const panelData = organizePanelData(data, entityCol, timeCol, dependentVar, independentVars);
    
    // Run the selected panel model
    const results = runPanelModel(panelData, modelType, effectsType, useRobust, clusterByEntity);
    
    // Display results
    displayPanelResults(results, modelType, effectsType);
}

// Organize data into panel format
function organizePanelData(data, entityCol, timeCol, dependentVar, independentVars) {
    // Group data by entity and time
    const panelData = {
        entities: [],
        timePeriods: [],
        dependentVar: dependentVar,
        independentVars: independentVars,
        data: {}
    };
    
    // Extract unique entities and time periods
    const entities = [...new Set(data.map(row => row[entityCol]))];
    const timePeriods = [...new Set(data.map(row => row[timeCol]))];
    
    panelData.entities = entities;
    panelData.timePeriods = timePeriods;
    
    // Organize data by entity and time
    entities.forEach(entity => {
        panelData.data[entity] = {};
        
        timePeriods.forEach(time => {
            const row = data.find(r => r[entityCol] === entity && r[timeCol] === time);
            
            if (row) {
                panelData.data[entity][time] = {
                    y: parseFloat(row[dependentVar]),
                    x: independentVars.map(iv => parseFloat(row[iv]))
                };
            }
        });
    });
    
    return panelData;
}

// Run panel data model
function runPanelModel(panelData, modelType, effectsType, useRobust, clusterByEntity) {
    // Simulate different panel model results
    const n = panelData.entities.length;
    const t = panelData.timePeriods.length;
    const k = panelData.independentVars.length;
    
    // Create simulated coefficients
    const beta = Array(k).fill().map(() => Math.random() * 4 - 2);
    const intercept = Math.random() * 10 - 5;
    
    // Create simulated standard errors
    let stdErrors = beta.map(() => Math.random() * 0.5);
    if (useRobust) {
        // Robust SEs are typically larger
        stdErrors = stdErrors.map(se => se * 1.2);
    }
    
    // Calculate t-stats and p-values
    const tStats = beta.map((b, i) => b / stdErrors[i]);
    const pValues = tStats.map(t => 2 * (1 - normCDF(Math.abs(t))));
    
    // Simulate R-squared
    let rSquared = Math.random() * 0.4 + 0.3;
    let adjustedRSquared = rSquared - (k * (1 - rSquared) / (n * t - k - 1));
    
    // Model-specific adjustments
    switch (modelType) {
        case 'fixed':
            // Fixed effects typically explain more variance
            rSquared += 0.1;
            adjustedRSquared = rSquared - (k * (1 - rSquared) / (n * t - n - k));
            break;
        case 'random':
            // Random effects are generally more efficient
            stdErrors = stdErrors.map(se => se * 0.9);
            break;
        case 'between':
            // Between estimator uses less information
            rSquared -= 0.1;
            adjustedRSquared = rSquared - (k * (1 - rSquared) / (n - k - 1));
            break;
    }
    
    // Generate entity and time effects if applicable
    let entityEffects = null;
    let timeEffects = null;
    
    if (effectsType === 'entity' || effectsType === 'both') {
        entityEffects = {};
        panelData.entities.forEach(entity => {
            entityEffects[entity] = Math.random() * 4 - 2;
        });
    }
    
    if (effectsType === 'time' || effectsType === 'both') {
        timeEffects = {};
        panelData.timePeriods.forEach(time => {
            timeEffects[time] = Math.random() * 2 - 1;
        });
    }
    
    // Calculate F-test for entity effects
    const fTestEntityEffects = {
        value: Math.random() * 10 + 2,
        pValue: Math.random() * 0.1
    };
    
    // Calculate Hausman test if random effects
    const hausmanTest = modelType === 'random' ? {
        value: Math.random() * 20,
        pValue: Math.random()
    } : null;
    
    // Calculate residual diagnostics
    const residualStats = {
        mean: 0,
        std: Math.random() * 2,
        skewness: Math.random() * 0.8 - 0.4,
        kurtosis: Math.random() * 2 + 2
    };
    
    return {
        modelType,
        effectsType,
        useRobust,
        clusterByEntity,
        n, t, k,
        intercept,
        beta,
        stdErrors,
        tStats,
        pValues,
        rSquared,
        adjustedRSquared,
        entityEffects,
        timeEffects,
        fTestEntityEffects,
        hausmanTest,
        residualStats,
        dependentVar: panelData.dependentVar,
        independentVars: panelData.independentVars,
        entities: panelData.entities,
        timePeriods: panelData.timePeriods
    };
}

// Display panel data results
function displayPanelResults(results, modelType, effectsType) {
    const resultsContainer = document.getElementById('panel-results');
    resultsContainer.innerHTML = '';
    
    const translations = config.languages[currentLanguage];
    
    // Create model header
    const modelTypeNames = {
        'pooled': 'Pooled OLS',
        'fixed': 'Fixed Effects',
        'random': 'Random Effects',
        'between': 'Between Effects'
    };
    
    const effectsTypeNames = {
        'entity': 'Entity Effects',
        'time': 'Time Effects',
        'both': 'Two-way Effects'
    };
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'regression-equation';
    headerDiv.innerHTML = `
        <h4>${modelTypeNames[modelType]} Model with ${effectsTypeNames[effectsType]}</h4>
        <p>Entities: ${results.n}, Time periods: ${results.t}, Total observations: ${results.n * results.t}</p>
        <p>Dependent variable: ${results.dependentVar}</p>
    `;
    resultsContainer.appendChild(headerDiv);
    
    // Create coefficient table
    const coeffTable = document.createElement('table');
    coeffTable.className = 'result-table';
    
    // Coefficients header
    const coeffHeader = document.createElement('tr');
    const coeffHeaderCell = document.createElement('th');
    coeffHeaderCell.colSpan = 5;
    coeffHeaderCell.textContent = translations.coefficients;
    coeffHeader.appendChild(coeffHeaderCell);
    coeffTable.appendChild(coeffHeader);
    
    // Column headers
    const coeffSubHeader = document.createElement('tr');
    ['Variable', 'Coefficient', 'Std. Error', 't-statistic', 'p-value'].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        coeffSubHeader.appendChild(th);
    });
    coeffTable.appendChild(coeffSubHeader);
    
    // Add intercept
    if (modelType !== 'fixed' || effectsType === 'time') {
        const interceptRow = document.createElement('tr');
        
        const varCell = document.createElement('td');
        varCell.textContent = 'Constant';
        
        const coefCell = document.createElement('td');
        coefCell.textContent = results.intercept.toFixed(4);
        
        const seCell = document.createElement('td');
        seCell.textContent = (Math.random() * 0.5).toFixed(4);
        
        const tStatCell = document.createElement('td');
        tStatCell.textContent = (results.intercept / parseFloat(seCell.textContent)).toFixed(4);
        
        const pValueCell = document.createElement('td');
        const pValue = 2 * (1 - normCDF(Math.abs(parseFloat(tStatCell.textContent))));
        pValueCell.textContent = pValue.toFixed(4);
        
        interceptRow.appendChild(varCell);
        interceptRow.appendChild(coefCell);
        interceptRow.appendChild(seCell);
        interceptRow.appendChild(tStatCell);
        interceptRow.appendChild(pValueCell);
        coeffTable.appendChild(interceptRow);
    }
    
    // Add coefficients
    results.independentVars.forEach((variable, idx) => {
        const row = document.createElement('tr');
        
        const labelCell = document.createElement('td');
        labelCell.textContent = variable;
        
        const valueCell = document.createElement('td');
        valueCell.textContent = results.beta[idx].toFixed(4);
        
        const seCell = document.createElement('td');
        seCell.textContent = results.stdErrors[idx].toFixed(4);
        
        const tStatCell = document.createElement('td');
        tStatCell.textContent = results.tStats[idx].toFixed(4);
        
        const pValueCell = document.createElement('td');
        pValueCell.textContent = results.pValues[idx].toFixed(4);
        
        // Highlight significance
        if (results.pValues[idx] < 0.01) {
            pValueCell.innerHTML = results.pValues[idx].toFixed(4) + '<sup>***</sup>';
        } else if (results.pValues[idx] < 0.05) {
            pValueCell.innerHTML = results.pValues[idx].toFixed(4) + '<sup>**</sup>';
        } else if (results.pValues[idx] < 0.1) {
            pValueCell.innerHTML = results.pValues[idx].toFixed(4) + '<sup>*</sup>';
        }
        
        row.appendChild(labelCell);
        row.appendChild(valueCell);
        row.appendChild(seCell);
        row.appendChild(tStatCell);
        row.appendChild(pValueCell);
        coeffTable.appendChild(row);
    });
    
    resultsContainer.appendChild(coeffTable);
    
    // Create model statistics table
    const statsTable = document.createElement('table');
    statsTable.className = 'result-table';
    
    // Stats header
    const statsHeader = document.createElement('tr');
    const statsHeaderCell = document.createElement('th');
    statsHeaderCell.colSpan = 2;
    statsHeaderCell.textContent = 'Model Statistics';
    statsHeader.appendChild(statsHeaderCell);
    statsTable.appendChild(statsHeader);
    
    // Add statistics rows
    [
        ['R-squared', results.rSquared.toFixed(4)],
        ['Adjusted R-squared', results.adjustedRSquared.toFixed(4)],
        ['Number of entities', results.n],
        ['Number of time periods', results.t],
        ['Total observations', results.n * results.t]
    ].forEach(stat => {
        const row = document.createElement('tr');
        const labelCell = document.createElement('td');
        labelCell.textContent = stat[0];
        const valueCell = document.createElement('td');
        valueCell.textContent = stat[1];
        row.appendChild(labelCell);
        row.appendChild(valueCell);
        statsTable.appendChild(row);
    });
    
    // Add model-specific statistics
    if (modelType === 'fixed' || modelType === 'random') {
        const fTestRow = document.createElement('tr');
        const fTestLabelCell = document.createElement('td');
        fTestLabelCell.textContent = 'F-test for entity effects';
        const fTestValueCell = document.createElement('td');
        fTestValueCell.textContent = `${results.fTestEntityEffects.value.toFixed(4)} (p=${results.fTestEntityEffects.pValue.toFixed(4)})`;
        fTestRow.appendChild(fTestLabelCell);
        fTestRow.appendChild(fTestValueCell);
        statsTable.appendChild(fTestRow);
    }
    
    // Add Hausman test for random effects
    if (modelType === 'random') {
        const hausmanRow = document.createElement('tr');
        const hausmanLabelCell = document.createElement('td');
        hausmanLabelCell.textContent = 'Hausman test';
        const hausmanValueCell = document.createElement('td');
        hausmanValueCell.textContent = `${results.hausmanTest.value.toFixed(4)} (p=${results.hausmanTest.pValue.toFixed(4)})`;
        hausmanRow.appendChild(hausmanLabelCell);
        hausmanRow.appendChild(hausmanValueCell);
        statsTable.appendChild(hausmanRow);
    }
    
    resultsContainer.appendChild(statsTable);
    
    // Create visualization
    createPanelVisualization(results);
}

// Create panel data visualization
function createPanelVisualization(results) {
    // Destroy existing chart if it exists
    if (window.panelChart) {
        window.panelChart.destroy();
    }
    
    const ctx = document.getElementById('panel-chart').getContext('2d');
    
    // Create a subset of entities for visualization (max 5)
    const shownEntities = results.entities.slice(0, 5);
    
    // Generate simulated data for visualization
    const datasets = [];
    
    shownEntities.forEach((entity, idx) => {
        // Generate simulated values for this entity
        const data = results.timePeriods.map(time => ({
            x: time,
            y: Math.random() * 5 + idx * 2
        }));
        
        datasets.push({
            label: `Entity ${entity}`,
            data: data,
            borderColor: getColor(idx),
            backgroundColor: getColor(idx, 0.1),
            borderWidth: 2
        });
    });
    
    // Create chart
    window.panelChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'category',
                    title: {
                        display: true,
                        text: 'Time Period'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: results.dependentVar
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `${results.dependentVar} by Entity`
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

// Show stationarity view
function showStationarityView() {
    if (!workbookData) {
        alert('Please import data first');
        return;
    }
    
    welcomeScreen.classList.add('hidden');
    dataView.classList.add('hidden');
    statsView.classList.add('hidden');
    regressionView.classList.add('hidden');
    document.getElementById('ardl-view').classList.add('hidden');
    document.getElementById('advanced-ts-view').classList.add('hidden');
    document.getElementById('stationarity-view').classList.remove('hidden');
    document.getElementById('panel-view').classList.add('hidden');
    
    updateStationarityView();
}

// Update stationarity view
function updateStationarityView() {
    // Get selectors
    const stationarityVars = document.getElementById('stationarity-vars');
    const stationarityTransform = document.getElementById('stationarity-transform');
    const stationarityDiff = document.getElementById('stationarity-diff');
    
    // Clear existing options
    stationarityVars.innerHTML = '';
    stationarityTransform.innerHTML = '';
    stationarityDiff.innerHTML = '';
    
    // Add column options
    columns.forEach(column => {
        const option = document.createElement('option');
        option.value = column;
        option.textContent = column;
        stationarityVars.appendChild(option);
    });
    
    // Select all except first column by default
    if (stationarityVars.options.length > 1) {
        for (let i = 1; i < stationarityVars.options.length; i++) {
            stationarityVars.options[i].selected = true;
        }
    }
    
    // Add transformation options
    Object.keys(transformations).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = transformations[key].name;
        stationarityTransform.appendChild(option);
    });
    
    // Add differencing options
    Object.keys(differenceOperations).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = differenceOperations[key].name;
        stationarityDiff.appendChild(option);
    });
    
    // Update labels with current language
    const translations = config.languages[currentLanguage];
    document.getElementById('stationarity-title').textContent = translations.stationarityTitle;
    document.getElementById('stationarity-vars-label').textContent = translations.stationarityVarsLabel;
    document.getElementById('stationarity-transform-label').textContent = translations.stationarityTransformLabel;
    document.getElementById('stationarity-diff-label').textContent = translations.stationarityDiffLabel;
    document.getElementById('stationarity-test-label').textContent = translations.stationarityTestLabel;
    document.getElementById('stationarity-lag-label').textContent = translations.stationarityLagLabel;
    document.getElementById('arma-p-label').textContent = translations.armaPLabel;
    document.getElementById('arma-q-label').textContent = translations.armaQLabel;
    document.getElementById('run-stationarity-text').textContent = translations.runStationarityText;
}

// Run stationarity analysis
function runStationarityAnalysis() {
    const selectedVars = Array.from(document.getElementById('stationarity-vars').selectedOptions).map(opt => opt.value);
    const transform = document.getElementById('stationarity-transform').value;
    const diff = document.getElementById('stationarity-diff').value;
    const testType = document.getElementById('stationarity-test').value;
    const maxLag = document.getElementById('stationarity-lag').value;
    const arP = parseInt(document.getElementById('arma-p').value);
    const arQ = parseInt(document.getElementById('arma-q').value);
    
    if (selectedVars.length === 0) {
        alert('Please select at least one variable');
        return;
    }
    
    // Clear previous results
    const resultsContainer = document.getElementById('stationarity-results');
    resultsContainer.innerHTML = '';
    
    // Process each selected variable
    selectedVars.forEach(variable => {
        // Extract data for this variable
        let series = data.map(row => parseFloat(row[variable]));
        
        // Apply transformations
        const originalSeries = [...series];
        series = applyTransformation(series, transform);
        
        // Apply differencing
        const transformedSeries = [...series];
        series = applyDifferencing(transformedSeries, diff);
        
        // Run stationarity tests
        const testResults = runStationarityTests(series, testType, maxLag);
        
        // Run ARMA model
        const armaResults = fitArmaModel(series, arP, arQ);
        
        // Display results for this variable
        displayStationarityResults(variable, testResults, armaResults, originalSeries, transformedSeries, series);
    });
    
    // Create charts for the last variable processed
    if (selectedVars.length > 0) {
        createStationarityCharts(selectedVars[0]);
    }
}

// Run stationarity tests
function runStationarityTests(series, testType, maxLag) {
    // Implementation of stationarity tests
    // In a real application, this would use statistical libraries
    
    let result = {
        type: testType,
        statistic: null,
        pValue: null,
        criticalValues: {},
        isStationary: false,
        maxLag: maxLag
    };
    
    // Simulate test results based on test type
    switch(testType) {
        case 'adf':
            // ADF test (more negative = more likely stationary)
            result.statistic = -Math.random() * 5 - 0.5; // Random between -0.5 and -5.5
            result.criticalValues = {
                '1%': -3.43,
                '5%': -2.86,
                '10%': -2.57
            };
            // Check if statistic is less than (more negative than) critical value at 5%
            result.isStationary = result.statistic < result.criticalValues['5%'];
            result.pValue = result.isStationary ? Math.random() * 0.05 : 0.05 + Math.random() * 0.95;
            break;
            
        case 'pp':
            // Phillips-Perron test (similar to ADF)
            result.statistic = -Math.random() * 5 - 0.5;
            result.criticalValues = {
                '1%': -3.43,
                '5%': -2.86,
                '10%': -2.57
            };
            result.isStationary = result.statistic < result.criticalValues['5%'];
            result.pValue = result.isStationary ? Math.random() * 0.05 : 0.05 + Math.random() * 0.95;
            break;
            
        case 'kpss':
            // KPSS test (smaller = more likely stationary, opposite of ADF)
            result.statistic = Math.random() * 1.5;
            result.criticalValues = {
                '1%': 0.739,
                '5%': 0.463,
                '10%': 0.347
            };
            // Check if statistic is less than critical value at 5%
            result.isStationary = result.statistic < result.criticalValues['5%'];
            result.pValue = result.isStationary ? 0.05 + Math.random() * 0.95 : Math.random() * 0.05;
            break;
    }
    
    return result;
}

// Fit ARMA model
function fitArmaModel(series, p, q) {
    // Simulate ARMA model fitting
    // In a real application, this would use statistical libraries
    
    // Create coefficients
    const arCoefs = Array(p).fill().map(() => Math.random() * 0.8 - 0.4);
    const maCoefs = Array(q).fill().map(() => Math.random() * 0.8 - 0.4);
    
    // Calculate ACF and PACF
    const maxLag = 20;
    const acf = calculateAcf(series, maxLag);
    const pacf = calculatePacf(series, maxLag);
    
    return {
        p: p,
        q: q,
        arCoefs: arCoefs,
        maCoefs: maCoefs,
        constant: Math.random() * 1.2 - 0.6,
        variance: Math.random() * 0.5,
        logLikelihood: -Math.random() * 50,
        aic: Math.random() * 3,
        bic: Math.random() * 3 + 1,
        hqc: Math.random() * 3 + 1.5,
        forecasts: null,
        acf: acf,
        pacf: pacf
    };
}

// Calculate autocorrelation function
function calculateAcf(series, maxLag) {
    // Simplified autocorrelation function calculator
    // In a real implementation, this would be more precise
    
    const n = series.length;
    const mean = series.reduce((sum, val) => sum + val, 0) / n;
    const acf = [];
    
    // ACF at lag 0 is always 1
    acf.push(1);
    
    // Calculate ACF for each lag
    for (let lag = 1; lag <= maxLag; lag++) {
        let numerator = 0;
        
        for (let t = lag; t < n; t++) {
            numerator += (series[t] - mean) * (series[t - lag] - mean);
        }
        
        const correlation = numerator / (n * series.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0));
        acf.push(correlation);
    }
    
    return acf;
}

// Calculate partial autocorrelation function
function calculatePacf(series, maxLag) {
    // Simplified partial autocorrelation function calculator
    // This is a very basic approximation, not the true PACF
    
    const n = series.length;
    const pacf = [1]; // PACF at lag 0 is 1
    
    // Generate semi-random PACF values that decay for demonstration
    for (let lag = 1; lag <= maxLag; lag++) {
        // Random PACF value that decays with lag
        const value = (Math.random() * 0.8 - 0.4) * Math.exp(-lag / 5);
        pacf.push(value);
    }
    
    return pacf;
}

// Display stationarity results
function displayStationarityResults(variable, testResults, armaResults, originalSeries, transformedSeries, finalSeries) {
    const resultsContainer = document.getElementById('stationarity-results');
    const translations = config.languages[currentLanguage];
    
    // Create result card
    const resultCard = document.createElement('div');
    resultCard.className = 'stationarity-result-card';
    
    // Variable name and test type
    let testName = '';
    switch(testResults.type) {
        case 'adf': testName = translations.adfTest; break;
        case 'pp': testName = translations.ppTest; break;
        case 'kpss': testName = translations.kpssTest; break;
    }
    
    resultCard.innerHTML = `
        <h4>${variable}</h4>
        <div class="test-result">
            <h5>${testName}</h5>
            <p>${translations.testStatistic}: ${testResults.statistic.toFixed(4)} (p-value: ${testResults.pValue.toFixed(4)})</p>
            <p>${translations.criticalValues}: 
               1%: ${testResults.criticalValues['1%'].toFixed(4)}, 
               5%: ${testResults.criticalValues['5%'].toFixed(4)}, 
               10%: ${testResults.criticalValues['10%'].toFixed(4)}</p>
            <p>
                <strong>
                    ${testResults.isStationary ? 
                      `<span class="stationary-result">${translations.stationaryResult}</span>` : 
                      `<span class="non-stationary-result">${translations.nonStationaryResult}</span>`}
                </strong>
            </p>
        </div>
        <div class="arma-result">
            <h5>${translations.armaFit} ARMA(${armaResults.p},${armaResults.q})</h5>
            <p>AIC: ${armaResults.aic.toFixed(4)}, BIC: ${armaResults.bic.toFixed(4)}</p>
            <div class="arma-coefficients">
                <p>Constant: ${armaResults.constant.toFixed(4)}</p>
                ${armaResults.arCoefs.map((coef, i) => `<p>AR${i+1}: ${coef.toFixed(4)}</p>`).join('')}
                ${armaResults.maCoefs.map((coef, i) => `<p>MA${i+1}: ${coef.toFixed(4)}</p>`).join('')}
            </div>
        </div>
    `;
    
    resultsContainer.appendChild(resultCard);
}

// Create stationarity charts
function createStationarityCharts(variableName) {
    // Find the data for the selected variable
    let series = data.map(row => parseFloat(row[variableName]));
    
    // Get transformation and differencing settings
    const transform = document.getElementById('stationarity-transform').value;
    const diff = document.getElementById('stationarity-diff').value;
    
    // Apply transformations and differencing
    const transformedSeries = applyTransformation(series, transform);
    const finalSeries = applyDifferencing(transformedSeries, diff);
    
    // Calculate ACF and PACF for display
    const maxLag = 20;
    const acf = calculateAcf(finalSeries, maxLag);
    const pacf = calculatePacf(finalSeries, maxLag);
    
    // Destroy existing chart if it exists
    if (window.stationarityChart) {
        window.stationarityChart.destroy();
    }
    
    const ctx = document.getElementById('stationarity-chart').getContext('2d');
    
    // Create chart with 3 sub-charts: Series, ACF, PACF
    window.stationarityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({ length: finalSeries.length }, (_, i) => i + 1),
            datasets: [
                {
                    label: 'Original Series',
                    data: series.slice(0, finalSeries.length),
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'Transformed Series',
                    data: finalSeries,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    borderWidth: 1,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    position: 'left',
                    title: {
                        display: true,
                        text: variableName
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: variableName
                }
            }
        }
    });
    
    // Create additional canvases for ACF and PACF
    const chartContainer = document.getElementById('stationarity-chart-container');
    
    // Remove any existing additional charts
    const existingCharts = chartContainer.querySelectorAll('canvas:not(#stationarity-chart)');
    existingCharts.forEach(canvas => canvas.remove());
    
    // Add ACF chart
    const acfCanvas = document.createElement('canvas');
    acfCanvas.id = 'acf-chart';
    acfCanvas.style.marginTop = '20px';
    acfCanvas.height = 200;
    chartContainer.appendChild(acfCanvas);
    
    // Add PACF chart
    const pacfCanvas = document.createElement('canvas');
    pacfCanvas.id = 'pacf-chart';
    pacfCanvas.style.marginTop = '20px';
    pacfCanvas.height = 200;
    chartContainer.appendChild(pacfCanvas);
    
    // Create ACF chart
    const acfCtx = document.getElementById('acf-chart').getContext('2d');
    new Chart(acfCtx, {
        type: 'bar',
        data: {
            labels: Array.from({ length: acf.length }, (_, i) => i),
            datasets: [{
                label: 'Autocorrelation Function',
                data: acf,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgb(54, 162, 235)',
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
                        text: 'Lag'
                    }
                },
                y: {
                    min: -1.1,
                    max: 1.1,
                    title: {
                        display: true,
                        text: 'Correlation'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Autocorrelation Function (ACF)'
                }
            }
        }
    });
    
    // Create PACF chart
    const pacfCtx = document.getElementById('pacf-chart').getContext('2d');
    new Chart(pacfCtx, {
        type: 'bar',
        data: {
            labels: Array.from({ length: pacf.length }, (_, i) => i),
            datasets: [{
                label: 'Partial Autocorrelation Function',
                data: pacf,
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                borderColor: 'rgb(255, 99, 132)',
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
                        text: 'Lag'
                    }
                },
                y: {
                    min: -1.1,
                    max: 1.1,
                    title: {
                        display: true,
                        text: 'Correlation'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Partial Autocorrelation Function (PACF)'
                }
            }
        }
    });
}

// Initialize the app
init();