const vscode = require('vscode');


// Function to get the interpreter path (vpi) from the user's configuration or ask for it if not set
async function getInterpreterPath() {
  const config = vscode.workspace.getConfiguration('varphi');
  let savedinterpreterPathPath = config.get('interpreterPath');
  if (!savedinterpreterPathPath) {
    savedinterpreterPathPath = await vscode.window.showInputBox({
      prompt: "Please enter the path to a Varphi Interpreter (vpi)."
    });
    if (savedinterpreterPathPath) {
      await config.update('interpreterPath', savedinterpreterPathPath, vscode.ConfigurationTarget.Global);
    }
  }
  return savedinterpreterPathPath;
}


// Function to prompt the user for a tape input
async function getTape() {
  return await vscode.window.showInputBox({
    prompt: "Please enter the tape as a string."
  });
}


// Function to run the Varphi program with or without debugging
async function runVarphiProgram(noDebug) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'varphi') {
    vscode.window.showErrorMessage("No Varphi file open to run.");
    return;
  }

  const sourcePath = editor.document.fileName;
  const tape = await getTape();
  const interpreterPath = await getInterpreterPath();


  const debugConfiguration = {
    type: 'varphi',
    request: 'launch',
    name: 'Run Varphi Program',
    tape: tape,
    sourcePath: sourcePath,
    noDebug: noDebug,
    interpreterPath: interpreterPath
  };

  vscode.debug.startDebugging(undefined, debugConfiguration);
}


function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('varphi.run', () => runVarphiProgram(true)),
    vscode.commands.registerCommand('varphi.debug', () => runVarphiProgram(false)),
    vscode.debug.registerDebugAdapterDescriptorFactory('varphi', {
      createDebugAdapterDescriptor: (session) => {
        const interpreterPathPath = session.configuration.interpreterPath;
        const programPath = session.configuration.sourcePath;
        return new vscode.DebugAdapterExecutable(interpreterPathPath, ["-a", programPath]);
      }
    }),
  );
}

function deactivate() { }


module.exports = {
  activate,
  deactivate
};
