import * as vscode from 'vscode';
import * as cp from 'child_process';

// Keep a reference to the terminal to avoid creating duplicates
let myTerminal: vscode.Terminal | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('[Varphi] Activating extension...');

    try {
        // Register Debug Adapter
        const factory = new VarphiDebugAdapterDescriptorFactory();
        context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('varphi', factory));

        // Register Commands
        context.subscriptions.push(vscode.commands.registerCommand('varphi.run', runHandler));
        context.subscriptions.push(vscode.commands.registerCommand('varphi.debug', debugHandler));

        // Register Diagnostics (Red Squiggles)
        const diagnosticCollection = vscode.languages.createDiagnosticCollection('varphi');
        context.subscriptions.push(diagnosticCollection);

        // Refresh diagnostics on any save to a Varphi document, or on file open
        context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
            if (document.languageId === 'varphi') {
                refreshDiagnostics(document, diagnosticCollection);
            }
        }));

        context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => {
            if (document.languageId === 'varphi') {
                refreshDiagnostics(document, diagnosticCollection);
            }
        }));
        
        // Check active document immediately if it's open
        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'varphi') {
            refreshDiagnostics(vscode.window.activeTextEditor.document, diagnosticCollection);
        }

        console.log('[Varphi] Commands and Diagnostics registered.');
    } catch (error) {
        console.error('[Varphi] Failed to activate:', error);
    }
}

export function deactivate() {
    if (myTerminal) {
        myTerminal.dispose();
    }
}


async function runHandler(fileUri: vscode.Uri) {
    const targetUri = fileUri || vscode.window.activeTextEditor?.document.uri;

    if (!targetUri) {
        vscode.window.showErrorMessage("Open a Varphi (.vp) file to run it.");
        return;
    }

    const config = vscode.workspace.getConfiguration('varphi');
    const executable = config.get<string>('interpreterPath') || 'vpi';

    // Create a new terminal if one doesn't already exist
    if (!myTerminal || myTerminal.exitStatus !== undefined) {
        myTerminal = vscode.window.createTerminal('Varphi');
    }
    
    // The user will be dealing with this terminal in run mode
    myTerminal.show();
    // Quote the path to handle spaces in filenames
    myTerminal.sendText(`${executable} "${targetUri.fsPath}"`);
}

async function debugHandler(fileUri: vscode.Uri) {
    const targetUri = fileUri || vscode.window.activeTextEditor?.document.uri;

    if (!targetUri) {
        vscode.window.showErrorMessage("Open a Varphi (.vp) file to debug it.");
        return;
    }

    const collectedTapes = await promptForTapes();

    if (collectedTapes === undefined) {
        return; 
    }

    vscode.debug.startDebugging(undefined, {
        type: 'varphi',
        name: 'Debug File',
        request: 'launch',
        sourcePath: targetUri.fsPath,
        tapes: collectedTapes
    });
}


async function promptForTapes(): Promise<string[] | undefined> {
    const tapes: string[] = [];
    let index = 0;

    while (true) {
        const input = await vscode.window.showInputBox({
            title: `Tape Input ${index + 1}`,
            prompt: `Enter content for Tape ${index + 1}. Press ENTER for blank. ESC to finish.`,
            placeHolder: "e.g. 123_abc",
            ignoreFocusOut: true 
        });

        if (input === undefined) {
            break; 
        }

        tapes.push(input);
        index++;
    }

    return tapes;
}

function refreshDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
    const config = vscode.workspace.getConfiguration('varphi');
    const executable = config.get<string>('interpreterPath') || 'vpi';
    
    // Execute: varphi --check "path/to/file.vp"
    cp.exec(`${executable} --check "${document.uri.fsPath}"`, (err, stdout, stderr) => {
        // Clear old errors first
        collection.clear();

        if (err) {
            const errorOutput = stderr || stdout || err.message;
            
            // Extract the line number from the error message
            const lineMatch = errorOutput.match(/-->\s*line\s*(\d+)/i);
            
            if (lineMatch) {
                // Convert 1-indexed line number to 0-indexed
                const line = parseInt(lineMatch[1]) - 1; 

                // Highlight the entire line
                const range = document.lineAt(line).range;
                
                // Use the raw error output as the message
                const diagnostic = new vscode.Diagnostic(
                    range, 
                    errorOutput.trim(), 
                    vscode.DiagnosticSeverity.Error
                );

                collection.set(document.uri, [diagnostic]);
            }
        }
    });
}


class VarphiDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    
    createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        
        const config = vscode.workspace.getConfiguration('varphi');
        const command = config.get<string>('interpreterPath') || 'vpi';

        const args = ['--dap'];

        if (session.configuration.sourcePath) {
            args.push(session.configuration.sourcePath);
        }

        if (session.configuration.tapes && Array.isArray(session.configuration.tapes) && session.configuration.tapes.length > 0) {
            args.push('--tapes');
            args.push(...session.configuration.tapes);
        }

        const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
        const options: vscode.DebugAdapterExecutableOptions = {
            cwd: workspaceFolder
        };

        console.log(`[Varphi] Spawning: ${command} ${args.join(' ')}`);

        return new vscode.DebugAdapterExecutable(command, args, options);
    }
}