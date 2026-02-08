#!/bin/bash

# Relay Wrapper Script
# Ensures the bin/relay.js is executed with node

# Resolve the directory of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if built
if [ ! -f "$DIR/bin/relay.js" ]; then
    echo "Relay not built. Building..."
    (cd "$DIR" && npm run build)
fi

# Execute
node "$DIR/bin/relay.js" "$@"
