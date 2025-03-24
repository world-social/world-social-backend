const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying WorldSocialToken...");

  // Get the contract factory
  const WorldSocialToken = await ethers.getContractFactory("WorldSocialToken");

  // Deploy the contract
  const token = await WorldSocialToken.deploy();
  await token.waitForDeployment();

  console.log("WorldSocialToken deployed to:", await token.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 