PACKAGES_DIR = terraform/packages
LAYER_DIR    = build/layer
REQS         = backend/requirements-lambda.txt
FUNCTIONS    = inventory transactions purchases suppliers ai_insights onboarding users contacts contact messages payments campaigns agents shop

# Use Python 3.12 Amazon Linux 2 image so cryptography gets Linux binaries (required for Lambda)
LAYER_DOCKER_IMAGE = public.ecr.aws/sam/build-python3.12:latest

.PHONY: build layer layer-docker package clean

build: layer-docker package

# Build layer with local pip (fast but wrong binaries on Windows — use layer-docker for Lambda)
layer:
	rm -rf $(LAYER_DIR)
	mkdir -p $(LAYER_DIR) $(PACKAGES_DIR)
	pip install -r $(REQS) -t $(LAYER_DIR)/python --quiet --upgrade
	cd $(LAYER_DIR) && zip -r ../../$(PACKAGES_DIR)/layer.zip python -x "*.pyc" "*__pycache__*" "*.dist-info/*" > /dev/null
	@echo "-> $(PACKAGES_DIR)/layer.zip"

# Build layer inside Docker (linux/amd64) so cryptography/PyJWT get x86_64 binaries for Lambda.
# --platform linux/amd64 is required on Mac M1/M2/M3 (arm64) to avoid architecture mismatch.
layer-docker:
	rm -rf $(LAYER_DIR)
	mkdir -p $(LAYER_DIR) $(PACKAGES_DIR)
	docker run --rm --platform linux/amd64 -v "$(CURDIR):/var/task" -w /var/task $(LAYER_DOCKER_IMAGE) \
		pip install -r $(REQS) -t $(LAYER_DIR)/python --quiet --upgrade
	cd $(LAYER_DIR) && zip -r ../../$(PACKAGES_DIR)/layer.zip python -x "*.pyc" "*__pycache__*" "*.dist-info/*" > /dev/null
	@echo "-> $(PACKAGES_DIR)/layer.zip (linux/amd64 build)"

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
