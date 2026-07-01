SHELL := /bin/bash

ANVIL_RPC_URL ?= http://127.0.0.1:8545
NEWFRAME_BASE_RPC_URL ?= http://127.0.0.1:1248
NEWFRAME_RPC_URL ?= http://127.0.0.1:1248?chainId=$(CHAIN_ID)
NEWFRAME_ORIGIN ?= http://newframe-contracts.local

CHAIN_ID ?= 31337
CHAIN_ID_HEX ?= 0x7a69
ANVIL_PORT ?= 8545
ANVIL_HOST ?= 127.0.0.1

HARNESS_ACCOUNT ?= 0x35f9179059a691d8beecf82fe112f7277e018588
HARNESS_ETH_BALANCE_HEX ?= 0x56bc75e2d63100000
HARNESS_USDC_BALANCE ?= 1000000000000

USDC_ADDRESS ?= 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
TEST_CONTRACT_ADDRESS ?= 0x0000000000000000000000000000000000001337

ANVIL_DEPLOYER_PRIVATE_KEY ?= 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

ETH_FLOW_VALUE ?= 0.01ether
USDC_FLOW_AMOUNT ?= 25000000
ETH_FLOW_MEMO ?= Newframe ETH integration flow
USDC_FLOW_MEMO ?= Newframe USDC integration flow

.PHONY: help build test anvil anvil-bg anvil-stop wait-anvil wait-newframe seed verify-seed smoke-direct setup ensure-newframe-chain newframe-add-chain newframe-switch-chain integration integration-eth integration-usdc

help:
	@echo "Targets:"
	@echo "  make anvil                Run Anvil in the foreground, mining every second"
	@echo "  make anvil-bg             Run Anvil in the background and write .anvil.pid/.anvil.log"
	@echo "  make seed                 Etch MockUSDC/TestContract into Anvil and fund the harness account"
	@echo "  make smoke-direct         Verify ETH + USDC transactions directly on Anvil"
	@echo "  make setup                Build, start Anvil in background, seed, and verify balances"
	@echo "  make ensure-newframe-chain Add/switch Newframe to local Anvil when needed"
	@echo "  make newframe-add-chain   Ask Newframe to add local Anvil chain 31337"
	@echo "  make integration-eth      Send an ETH deposit through Newframe"
	@echo "  make integration-usdc     Send approve + USDC deposit through Newframe"
	@echo "  make integration          Run both Newframe flow transactions"

build:
	forge build

test:
	forge test

anvil:
	anvil --host $(ANVIL_HOST) --port $(ANVIL_PORT) --chain-id $(CHAIN_ID) --block-time 1

anvil-bg:
	@if [ -f .anvil.pid ] && kill -0 "$$(cat .anvil.pid)" >/dev/null 2>&1; then \
		echo "Anvil already running with pid $$(cat .anvil.pid)"; \
	else \
		rm -f .anvil.pid; \
		nohup anvil --host $(ANVIL_HOST) --port $(ANVIL_PORT) --chain-id $(CHAIN_ID) --block-time 1 > .anvil.log 2>&1 < /dev/null & \
		echo $$! > .anvil.pid; \
		echo "Started Anvil with pid $$(cat .anvil.pid)"; \
	fi
	@$(MAKE) wait-anvil

anvil-stop:
	@if [ -f .anvil.pid ] && kill -0 "$$(cat .anvil.pid)" >/dev/null 2>&1; then \
		kill "$$(cat .anvil.pid)"; \
		rm -f .anvil.pid; \
		echo "Stopped Anvil"; \
	else \
		rm -f .anvil.pid; \
		echo "No background Anvil pid found"; \
	fi

wait-anvil:
	@for _ in $$(seq 1 60); do \
		if cast chain-id --rpc-url "$(ANVIL_RPC_URL)" >/dev/null 2>&1; then \
			echo "Anvil is ready at $(ANVIL_RPC_URL)"; \
			exit 0; \
		fi; \
		sleep 0.25; \
	done; \
	echo "Timed out waiting for Anvil at $(ANVIL_RPC_URL)"; \
	exit 1

wait-newframe:
	@for _ in $$(seq 1 60); do \
		if cast chain-id --rpc-url "$(NEWFRAME_BASE_RPC_URL)" --rpc-headers "Origin: $(NEWFRAME_ORIGIN)" >/dev/null 2>&1; then \
			echo "Newframe RPC is ready at $(NEWFRAME_BASE_RPC_URL)"; \
			exit 0; \
		fi; \
		sleep 0.25; \
	done; \
	echo "Timed out waiting for Newframe RPC at $(NEWFRAME_BASE_RPC_URL)"; \
	exit 1

seed: build wait-anvil
	@echo "Funding harness account $(HARNESS_ACCOUNT) with 100 ETH"
	@cast rpc anvil_setBalance "$(HARNESS_ACCOUNT)" "$(HARNESS_ETH_BALANCE_HEX)" --rpc-url "$(ANVIL_RPC_URL)" >/dev/null
	@echo "Etching MockUSDC at $(USDC_ADDRESS)"
	@MOCK_USDC_CODE="$$(forge inspect src/MockUSDC.sol:MockUSDC deployedBytecode)"; \
		cast rpc anvil_setCode "$(USDC_ADDRESS)" "$$MOCK_USDC_CODE" --rpc-url "$(ANVIL_RPC_URL)" >/dev/null
	@echo "Etching TestContract at $(TEST_CONTRACT_ADDRESS)"
	@TEST_CONTRACT_CODE="$$(forge inspect src/TestContract.sol:TestContract deployedBytecode)"; \
		cast rpc anvil_setCode "$(TEST_CONTRACT_ADDRESS)" "$$TEST_CONTRACT_CODE" --rpc-url "$(ANVIL_RPC_URL)" >/dev/null
	@echo "Minting seeded USDC to $(HARNESS_ACCOUNT)"
	@cast send "$(USDC_ADDRESS)" "mint(address,uint256)" "$(HARNESS_ACCOUNT)" "$(HARNESS_USDC_BALANCE)" \
		--rpc-url "$(ANVIL_RPC_URL)" \
		--private-key "$(ANVIL_DEPLOYER_PRIVATE_KEY)" \
		--confirmations 1 >/dev/null
	@$(MAKE) verify-seed

verify-seed:
	@echo "ETH balance:"
	@cast balance "$(HARNESS_ACCOUNT)" --rpc-url "$(ANVIL_RPC_URL)"
	@echo "USDC balance:"
	@cast call "$(USDC_ADDRESS)" "balanceOf(address)(uint256)" "$(HARNESS_ACCOUNT)" --rpc-url "$(ANVIL_RPC_URL)"
	@echo "TestContract code bytes:"
	@cast code "$(TEST_CONTRACT_ADDRESS)" --rpc-url "$(ANVIL_RPC_URL)" | wc -c | tr -d ' '

smoke-direct:
	@echo "Sending direct ETH + USDC smoke transactions on Anvil with harness account impersonation"
	@cast rpc anvil_impersonateAccount "$(HARNESS_ACCOUNT)" --rpc-url "$(ANVIL_RPC_URL)" >/dev/null
	@cast send "$(TEST_CONTRACT_ADDRESS)" "depositEth(string)" "direct eth smoke" \
		--value "$(ETH_FLOW_VALUE)" \
		--unlocked \
		--from "$(HARNESS_ACCOUNT)" \
		--rpc-url "$(ANVIL_RPC_URL)" \
		--confirmations 1 >/dev/null
	@cast send "$(USDC_ADDRESS)" "approve(address,uint256)" "$(TEST_CONTRACT_ADDRESS)" "$(USDC_FLOW_AMOUNT)" \
		--unlocked \
		--from "$(HARNESS_ACCOUNT)" \
		--rpc-url "$(ANVIL_RPC_URL)" \
		--confirmations 1 >/dev/null
	@cast send "$(TEST_CONTRACT_ADDRESS)" "depositToken(address,uint256,string)" "$(USDC_ADDRESS)" "$(USDC_FLOW_AMOUNT)" "direct usdc smoke" \
		--unlocked \
		--from "$(HARNESS_ACCOUNT)" \
		--rpc-url "$(ANVIL_RPC_URL)" \
		--confirmations 1 >/dev/null
	@cast rpc anvil_stopImpersonatingAccount "$(HARNESS_ACCOUNT)" --rpc-url "$(ANVIL_RPC_URL)" >/dev/null
	@echo "ETH deposited:"
	@cast call "$(TEST_CONTRACT_ADDRESS)" "ethDeposits(address)(uint256)" "$(HARNESS_ACCOUNT)" --rpc-url "$(ANVIL_RPC_URL)"
	@echo "USDC deposited:"
	@cast call "$(TEST_CONTRACT_ADDRESS)" "tokenDeposits(address,address)(uint256)" "$(USDC_ADDRESS)" "$(HARNESS_ACCOUNT)" --rpc-url "$(ANVIL_RPC_URL)"

setup: anvil-bg seed

ensure-newframe-chain: wait-anvil wait-newframe
	@if cast chain-id --rpc-url "$(NEWFRAME_RPC_URL)" --rpc-headers "Origin: $(NEWFRAME_ORIGIN)" >/dev/null 2>&1; then \
		echo "Newframe already knows local Anvil chain $(CHAIN_ID)"; \
	else \
		echo "Newframe does not know local Anvil chain $(CHAIN_ID). Approve the add/switch prompt(s) in Newframe."; \
		$(MAKE) --no-print-directory newframe-add-chain; \
	fi
	@for _ in $$(seq 1 120); do \
		if cast chain-id --rpc-url "$(NEWFRAME_RPC_URL)" --rpc-headers "Origin: $(NEWFRAME_ORIGIN)" >/dev/null 2>&1; then \
			echo "Newframe local Anvil chain $(CHAIN_ID) is ready"; \
			exit 0; \
		fi; \
		sleep 0.5; \
	done; \
	echo "Newframe still cannot resolve chain $(CHAIN_ID). Approve/accept the chain request in Newframe, then rerun this target."; \
	exit 1

newframe-add-chain:
	@echo "Requesting Newframe add/switch to local Anvil chain $(CHAIN_ID). Approve the prompt in Newframe."
	@curl -sS \
		-H 'Content-Type: application/json' \
		-H 'Origin: $(NEWFRAME_ORIGIN)' \
		--data '{"jsonrpc":"2.0","id":1,"method":"wallet_addEthereumChain","params":[{"chainId":"$(CHAIN_ID_HEX)","chainName":"Newframe Local Anvil","nativeCurrency":{"name":"Ether","symbol":"ETH","decimals":18},"rpcUrls":["$(ANVIL_RPC_URL)"],"blockExplorerUrls":[]}]}' \
		"$(NEWFRAME_BASE_RPC_URL)"
	@echo

newframe-switch-chain:
	@echo "Requesting Newframe switch to local Anvil chain $(CHAIN_ID)."
	@curl -sS \
		-H 'Content-Type: application/json' \
		-H 'Origin: $(NEWFRAME_ORIGIN)' \
		--data '{"jsonrpc":"2.0","id":2,"method":"wallet_switchEthereumChain","params":[{"chainId":"$(CHAIN_ID_HEX)"}]}' \
		"$(NEWFRAME_BASE_RPC_URL)"
	@echo

integration: ensure-newframe-chain integration-eth integration-usdc

integration-eth: ensure-newframe-chain
	@echo "Sending ETH deposit through Newframe. Confirm the request in the wallet."
	cast send "$(TEST_CONTRACT_ADDRESS)" "depositEth(string)" "$(ETH_FLOW_MEMO)" \
		--value "$(ETH_FLOW_VALUE)" \
		--unlocked \
		--from "$(HARNESS_ACCOUNT)" \
		--rpc-url "$(NEWFRAME_RPC_URL)" \
		--rpc-headers "Origin: $(NEWFRAME_ORIGIN)" \
		--confirmations 1

integration-usdc: ensure-newframe-chain
	@echo "Approving USDC through Newframe. Confirm the request in the wallet."
	cast send "$(USDC_ADDRESS)" "approve(address,uint256)" "$(TEST_CONTRACT_ADDRESS)" "$(USDC_FLOW_AMOUNT)" \
		--unlocked \
		--from "$(HARNESS_ACCOUNT)" \
		--rpc-url "$(NEWFRAME_RPC_URL)" \
		--rpc-headers "Origin: $(NEWFRAME_ORIGIN)" \
		--confirmations 1
	@echo "Depositing USDC through Newframe. Confirm the request in the wallet."
	cast send "$(TEST_CONTRACT_ADDRESS)" "depositToken(address,uint256,string)" "$(USDC_ADDRESS)" "$(USDC_FLOW_AMOUNT)" "$(USDC_FLOW_MEMO)" \
		--unlocked \
		--from "$(HARNESS_ACCOUNT)" \
		--rpc-url "$(NEWFRAME_RPC_URL)" \
		--rpc-headers "Origin: $(NEWFRAME_ORIGIN)" \
		--confirmations 1
