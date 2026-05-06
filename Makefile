PACKAGES_DIR = terraform/packages
LAYER_DIR    = build/layer
REQS         = backend/requirements-lambda.txt
FUNCTIONS    = inventory transactions purchases suppliers ai_insights onboarding users contacts contact messages payments campaigns agents shop

# Use Python 3.12 Amazon Linux 2 image so cryptography gets Linux binaries (required for Lambda)
LAYER_DOCKER_IMAGE = public.ecr.aws/sam/build-python3.12:latest

.PHONY: build layer layer-docker package clean

build: layer-docker package

# Intentionally blocked — local pip produces Mac binaries that crash on Lambda Linux x86_64.
# Always use `make layer-docker` or `make build`.
layer:
	@echo "ERROR: 'make layer' builds Mac binaries that break Lambda. Use 'make layer-docker' instead." && exit 1

# Build layer inside Docker (linux/amd64) so cryptography/PyJWT get x86_64 binaries for Lambda.
# --platform linux/amd64 is required on Mac M1/M2/M3 (arm64) to avoid architecture mismatch.
layer-docker:
	rm -rf $(LAYER_DIR)
	mkdir -p $(LAYER_DIR) $(PACKAGES_DIR)
	docker run --rm --platform linux/amd64 -v "$(CURDIR):/var/task" -w /var/task $(LAYER_DOCKER_IMAGE) \
		pip install -r $(REQS) -t $(LAYER_DIR)/python --quiet --upgrade
	cd $(LAYER_DIR) && zip -r ../../$(PACKAGES_DIR)/layer.zip python -x "*.pyc" "*__pycache__*" "*.dist-info/*" > /dev/null
	@# Verify the cryptography binary is Linux ELF x86-64, not a Mac Mach-O binary
	@file $(LAYER_DIR)/python/cryptography/hazmat/bindings/_rust.abi3.so | grep -q "ELF 64-bit.*x86-64" \
		|| (echo "ERROR: layer contains non-Linux binary — Lambda will crash. Check Docker platform." && exit 1)
	@echo "-> $(PACKAGES_DIR)/layer.zip (linux/amd64 verified)"

package:
	mkdir -p $(PACKAGES_DIR)
	@for func in $(FUNCTIONS); do \
		echo "Packaging $$func..."; \
		rm -rf build/$$func; \
		mkdir -p build/$$func/shared; \
		cp backend/functions/$$func/handler.py build/$$func/; \
		cp backend/shared/*.py build/$$func/shared/; \
		cd build/$$func && zip -r ../../$(PACKAGES_DIR)/$$func.zip . -x "*.pyc" > /dev/null && cd ../..; \
		echo "  -> $(PACKAGES_DIR)/$$func.zip"; \
	done

clean:
	rm -rf build/ $(PACKAGES_DIR)/*.zip
