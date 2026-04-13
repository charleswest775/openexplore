"""Entry point for the OpenExplore Python sidecar."""

import sys

from openexplore.rpc_server import RPCServer


def main():
    server = RPCServer()
    server.run()


if __name__ == "__main__":
    main()
