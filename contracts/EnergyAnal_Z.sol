pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EnergyAnal_Z is ZamaEthereumConfig {
    struct EnergyRecord {
        euint32 encryptedUsage;       // Encrypted energy consumption value
        uint256 publicLocation;       // Public location identifier
        uint256 publicTimestamp;      // Public timestamp
        address owner;                // Data owner address
        uint32 decryptedUsage;        // Decrypted usage value after verification
        bool isVerified;              // Verification status flag
    }

    mapping(string => EnergyRecord) public energyRecords;
    string[] public recordIds;

    // Community average storage
    euint32 public encryptedCommunityAverage;
    uint32 public decryptedCommunityAverage;
    bool public isAverageVerified;

    event EnergyRecordCreated(string indexed recordId, address indexed owner);
    event DecryptionVerified(string indexed recordId, uint32 decryptedValue);
    event CommunityAverageUpdated(uint32 averageValue);

    constructor() ZamaEthereumConfig() {
        // Initialize community average with zero value
        encryptedCommunityAverage = FHE.encrypt(0, new bytes(0));
        FHE.makePubliclyDecryptable(encryptedCommunityAverage);
    }

    function addEnergyRecord(
        string calldata recordId,
        externalEuint32 encryptedUsage,
        bytes calldata inputProof,
        uint256 location,
        uint256 timestamp
    ) external {
        require(bytes(energyRecords[recordId].owner).length == 0, "Record already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedUsage, inputProof)), "Invalid encrypted input");

        energyRecords[recordId] = EnergyRecord({
            encryptedUsage: FHE.fromExternal(encryptedUsage, inputProof),
            publicLocation: location,
            publicTimestamp: timestamp,
            owner: msg.sender,
            decryptedUsage: 0,
            isVerified: false
        });

        FHE.allowThis(energyRecords[recordId].encryptedUsage);
        FHE.makePubliclyDecryptable(energyRecords[recordId].encryptedUsage);

        recordIds.push(recordId);
        emit EnergyRecordCreated(recordId, msg.sender);
    }

    function verifyEnergyRecord(
        string calldata recordId,
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(energyRecords[recordId].owner).length > 0, "Record does not exist");
        require(!energyRecords[recordId].isVerified, "Record already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(energyRecords[recordId].encryptedUsage);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);

        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        energyRecords[recordId].decryptedUsage = decodedValue;
        energyRecords[recordId].isVerified = true;

        emit DecryptionVerified(recordId, decodedValue);
    }

    function updateCommunityAverage(
        externalEuint32 encryptedAverage,
        bytes calldata inputProof
    ) external {
        require(FHE.isInitialized(FHE.fromExternal(encryptedAverage, inputProof)), "Invalid encrypted input");

        encryptedCommunityAverage = FHE.fromExternal(encryptedAverage, inputProof);
        FHE.allowThis(encryptedCommunityAverage);
        FHE.makePubliclyDecryptable(encryptedCommunityAverage);

        isAverageVerified = false;
        emit CommunityAverageUpdated(0); // Placeholder event
    }

    function verifyCommunityAverage(
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(!isAverageVerified, "Average already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(encryptedCommunityAverage);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);

        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        decryptedCommunityAverage = decodedValue;
        isAverageVerified = true;

        emit CommunityAverageUpdated(decodedValue);
    }

    function compareEnergyUsage(string calldata recordId) external view returns (string memory) {
        require(bytes(energyRecords[recordId].owner).length > 0, "Record does not exist");
        require(energyRecords[recordId].isVerified, "Record not verified");
        require(isAverageVerified, "Community average not verified");

        if (energyRecords[recordId].decryptedUsage > decryptedCommunityAverage) {
            return "Above average - Consider energy-saving measures";
        } else if (energyRecords[recordId].decryptedUsage < decryptedCommunityAverage) {
            return "Below average - Good energy efficiency";
        } else {
            return "Equal to community average";
        }
    }

    function getEnergyRecord(string calldata recordId) external view returns (
        uint256 location,
        uint256 timestamp,
        address owner,
        bool isVerified,
        uint32 decryptedUsage
    ) {
        require(bytes(energyRecords[recordId].owner).length > 0, "Record does not exist");
        EnergyRecord storage record = energyRecords[recordId];

        return (
            record.publicLocation,
            record.publicTimestamp,
            record.owner,
            record.isVerified,
            record.decryptedUsage
        );
    }

    function getAllRecordIds() external view returns (string[] memory) {
        return recordIds;
    }

    function getCommunityAverage() external view returns (uint32) {
        require(isAverageVerified, "Community average not verified");
        return decryptedCommunityAverage;
    }
}


