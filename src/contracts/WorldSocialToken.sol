// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title WorldSocialToken
 * @dev ERC20 Token for the WorldSocial platform with content creator rewards
 */
contract WorldSocialToken is ERC20, Ownable, Pausable {
    // Events
    event CreatorRewarded(address indexed creator, uint256 amount);
    event ViewerRewarded(address indexed viewer, uint256 amount);
    event StakeDeposited(address indexed user, uint256 amount);
    event StakeWithdrawn(address indexed user, uint256 amount);

    // Constants
    uint256 public constant CREATOR_REWARD_PERCENTAGE = 70; // 70% of rewards go to creators
    uint256 public constant VIEWER_REWARD_PERCENTAGE = 30;  // 30% of rewards go to viewers
    uint256 public constant MIN_STAKE_AMOUNT = 100 * 10**18; // 100 tokens minimum stake
    uint256 public constant LOCK_PERIOD = 7 days;

    // Staking structure
    struct Stake {
        uint256 amount;
        uint256 timestamp;
    }

    // Mappings
    mapping(address => Stake) public stakes;
    mapping(address => bool) public isContentCreator;
    mapping(address => uint256) public creatorRewards;
    mapping(address => uint256) public viewerRewards;

    constructor() ERC20("WorldSocial Token", "WST") Ownable(msg.sender) {
        // Initial supply: 100 million tokens
        _mint(msg.sender, 100_000_000 * 10**decimals());
    }

    /**
     * @dev Pause token transfers and operations
     */
    function pause() public onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause token transfers and operations
     */
    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * @dev Register an address as a content creator
     */
    function registerCreator(address creator) external onlyOwner {
        require(!isContentCreator[creator], "Already registered as creator");
        isContentCreator[creator] = true;
    }

    /**
     * @dev Reward a content creator for their content
     */
    function rewardCreator(address creator, uint256 amount) external onlyOwner whenNotPaused {
        require(isContentCreator[creator], "Not a registered creator");
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 creatorAmount = (amount * CREATOR_REWARD_PERCENTAGE) / 100;
        creatorRewards[creator] += creatorAmount;
        _mint(creator, creatorAmount);
        
        emit CreatorRewarded(creator, creatorAmount);
    }

    /**
     * @dev Reward a viewer for watching content
     */
    function rewardViewer(address viewer, uint256 amount) external onlyOwner whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 viewerAmount = (amount * VIEWER_REWARD_PERCENTAGE) / 100;
        viewerRewards[viewer] += viewerAmount;
        _mint(viewer, viewerAmount);
        
        emit ViewerRewarded(viewer, viewerAmount);
    }

    /**
     * @dev Stake tokens to earn platform benefits
     */
    function stake(uint256 amount) external whenNotPaused {
        require(amount >= MIN_STAKE_AMOUNT, "Below minimum stake amount");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        if (stakes[msg.sender].amount > 0) {
            require(block.timestamp >= stakes[msg.sender].timestamp + LOCK_PERIOD, "Stake still locked");
        }

        _transfer(msg.sender, address(this), amount);
        stakes[msg.sender] = Stake(amount, block.timestamp);
        
        emit StakeDeposited(msg.sender, amount);
    }

    /**
     * @dev Withdraw staked tokens after lock period
     */
    function unstake() external whenNotPaused {
        Stake memory userStake = stakes[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(block.timestamp >= userStake.timestamp + LOCK_PERIOD, "Stake still locked");

        uint256 amount = userStake.amount;
        delete stakes[msg.sender];
        _transfer(address(this), msg.sender, amount);
        
        emit StakeWithdrawn(msg.sender, amount);
    }

    /**
     * @dev Get staking information for a user
     */
    function getStakeInfo(address user) external view returns (uint256 amount, uint256 timestamp) {
        Stake memory userStake = stakes[user];
        return (userStake.amount, userStake.timestamp);
    }

    /**
     * @dev Override transfer function to check for paused state
     */
    function _update(address from, address to, uint256 value) internal virtual override whenNotPaused {
        super._update(from, to, value);
    }
} 