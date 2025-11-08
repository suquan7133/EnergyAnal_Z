import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface EnergyData {
  id: string;
  name: string;
  encryptedValue: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
}

interface EnergyStats {
  totalUsage: number;
  communityAvg: number;
  efficiencyScore: number;
  carbonFootprint: number;
  savingsPotential: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [energyData, setEnergyData] = useState<EnergyData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingData, setCreatingData] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newEnergyData, setNewEnergyData] = useState({ 
    name: "", 
    usage: "", 
    description: "",
    category: "residential"
  });
  const [selectedData, setSelectedData] = useState<EnergyData | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const energyList: EnergyData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          energyList.push({
            id: businessId,
            name: businessData.name,
            encryptedValue: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setEnergyData(energyList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createEnergyData = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingData(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating energy data with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const usageValue = parseInt(newEnergyData.usage) || 0;
      const businessId = `energy-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, usageValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newEnergyData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        usageValue,
        0,
        newEnergyData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Energy data created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewEnergyData({ name: "", usage: "", description: "", category: "residential" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingData(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: `Contract is available: ${available}` 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const calculateStats = (): EnergyStats => {
    const verifiedEntries = energyData.filter(data => data.isVerified);
    const totalUsage = verifiedEntries.reduce((sum, data) => sum + data.decryptedValue, 0);
    const communityAvg = verifiedEntries.length > 0 ? totalUsage / verifiedEntries.length : 0;
    
    const currentData = selectedData && selectedData.isVerified ? selectedData.decryptedValue : 0;
    const efficiencyScore = currentData > 0 ? Math.max(0, 100 - (currentData / communityAvg) * 100) : 0;
    const carbonFootprint = currentData * 0.92;
    const savingsPotential = Math.max(0, currentData - communityAvg) * 0.15;

    return {
      totalUsage,
      communityAvg: Math.round(communityAvg),
      efficiencyScore: Math.round(efficiencyScore),
      carbonFootprint: Math.round(carbonFootprint),
      savingsPotential: Math.round(savingsPotential)
    };
  };

  const filteredData = energyData.filter(data => 
    data.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    data.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const faqItems = [
    { question: "什么是同态加密？", answer: "同态加密允许在加密数据上直接进行计算，无需解密，保护您的能耗隐私。" },
    { question: "我的数据如何被保护？", answer: "所有能耗数据在传输和存储过程中都经过加密处理，只有您能解密查看。" },
    { question: "社区平均值如何计算？", answer: "通过同态加密技术，系统可以在不解密的情况下计算社区平均能耗值。" },
    { question: "节能建议如何生成？", answer: "系统比较您的加密能耗与社区加密平均值，提供个性化的节能建议。" }
  ];

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🔋 Private Energy Analytics</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">⚡</div>
            <h2>Connect Your Wallet to Start</h2>
            <p>Connect your wallet to initialize the encrypted energy analytics system</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted energy system...</p>
    </div>
  );

  const stats = calculateStats();

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🔋 Private Energy Analytics</h1>
          <span className="tagline">FHE-Powered Energy Insights</span>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="tech-btn">Check FHE Status</button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">+ Add Energy Data</button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="dashboard-grid">
          <div className="stats-panel">
            <h3>Energy Analytics</h3>
            <div className="stat-cards">
              <div className="stat-card">
                <div className="stat-value">{stats.communityAvg}</div>
                <div className="stat-label">Community Avg (kWh)</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.efficiencyScore}%</div>
                <div className="stat-label">Efficiency Score</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.carbonFootprint}</div>
                <div className="stat-label">CO2 Saved (kg)</div>
              </div>
            </div>
          </div>

          <div className="data-panel">
            <div className="panel-header">
              <h3>Energy Data Records</h3>
              <div className="panel-controls">
                <input 
                  type="text" 
                  placeholder="Search records..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <button onClick={loadData} disabled={isRefreshing} className="refresh-btn">
                  {isRefreshing ? "🔄" : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="data-list">
              {filteredData.length === 0 ? (
                <div className="no-data">
                  <p>No energy records found</p>
                  <button onClick={() => setShowCreateModal(true)} className="create-btn">
                    Add First Record
                  </button>
                </div>
              ) : filteredData.map((data, index) => (
                <div 
                  className={`data-item ${selectedData?.id === data.id ? "selected" : ""}`}
                  key={index}
                  onClick={() => setSelectedData(data)}
                >
                  <div className="data-main">
                    <div className="data-name">{data.name}</div>
                    <div className="data-meta">
                      <span>Usage: {data.isVerified ? `${data.decryptedValue} kWh` : "🔒 Encrypted"}</span>
                      <span>{new Date(data.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className={`data-status ${data.isVerified ? "verified" : "encrypted"}`}>
                    {data.isVerified ? "✅ Verified" : "🔓 Ready to Verify"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-panel">
            <h3>Energy Usage Distribution</h3>
            <div className="chart-container">
              {filteredData.filter(data => data.isVerified).map((data, index) => (
                <div key={index} className="chart-bar">
                  <div 
                    className="bar-fill" 
                    style={{ height: `${Math.min(100, (data.decryptedValue / 1000) * 100)}%` }}
                  >
                    <span className="bar-value">{data.decryptedValue}kWh</span>
                  </div>
                  <div className="bar-label">{data.name}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="faq-panel">
            <div className="faq-header">
              <h3>FHE Energy FAQ</h3>
              <button onClick={() => setShowFAQ(!showFAQ)} className="toggle-btn">
                {showFAQ ? "▲" : "▼"}
              </button>
            </div>
            {showFAQ && (
              <div className="faq-content">
                {faqItems.map((item, index) => (
                  <div key={index} className="faq-item">
                    <div className="faq-question">Q: {item.question}</div>
                    <div className="faq-answer">A: {item.answer}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateEnergy 
          onSubmit={createEnergyData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingData} 
          energyData={newEnergyData} 
          setEnergyData={setNewEnergyData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedData && (
        <EnergyDetailModal 
          data={selectedData} 
          onClose={() => { 
            setSelectedData(null); 
            setDecryptedValue(null); 
          }} 
          decryptedValue={decryptedValue} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedData.id)}
          stats={stats}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateEnergy: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  energyData: any;
  setEnergyData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, energyData, setEnergyData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'usage') {
      const intValue = value.replace(/[^\d]/g, '');
      setEnergyData({ ...energyData, [name]: intValue });
    } else {
      setEnergyData({ ...energyData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-energy-modal">
        <div className="modal-header">
          <h2>Add Energy Consumption</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Protection</strong>
            <p>Energy usage will be encrypted with homomorphic encryption</p>
          </div>
          
          <div className="form-group">
            <label>Record Name *</label>
            <input 
              type="text" 
              name="name" 
              value={energyData.name} 
              onChange={handleChange} 
              placeholder="e.g., January Home Usage" 
            />
          </div>
          
          <div className="form-group">
            <label>Energy Usage (kWh) *</label>
            <input 
              type="number" 
              name="usage" 
              value={energyData.usage} 
              onChange={handleChange} 
              placeholder="Enter usage in kWh" 
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Category</label>
            <select name="category" value={energyData.category} onChange={handleChange}>
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
              <option value="industrial">Industrial</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description" 
              value={energyData.description} 
              onChange={handleChange} 
              placeholder="Additional notes..." 
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !energyData.name || !energyData.usage} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Create Record"}
          </button>
        </div>
      </div>
    </div>
  );
};

const EnergyDetailModal: React.FC<{
  data: EnergyData;
  onClose: () => void;
  decryptedValue: number | null;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
  stats: any;
}> = ({ data, onClose, decryptedValue, isDecrypting, decryptData, stats }) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) return;
    const result = await decryptData();
  };

  const getRecommendation = () => {
    const usage = data.isVerified ? data.decryptedValue : (decryptedValue || 0);
    if (usage > stats.communityAvg) {
      return "Your usage is above community average. Consider energy-efficient appliances.";
    } else {
      return "Great! Your usage is efficient compared to community average.";
    }
  };

  return (
    <div className="modal-overlay">
      <div className="energy-detail-modal">
        <div className="modal-header">
          <h2>Energy Data Details</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="energy-info">
            <div className="info-grid">
              <div className="info-item">
                <span>Record Name:</span>
                <strong>{data.name}</strong>
              </div>
              <div className="info-item">
                <span>Creator:</span>
                <strong>{data.creator.substring(0, 8)}...{data.creator.substring(36)}</strong>
              </div>
              <div className="info-item">
                <span>Date:</span>
                <strong>{new Date(data.timestamp * 1000).toLocaleDateString()}</strong>
              </div>
              <div className="info-item">
                <span>Status:</span>
                <strong className={data.isVerified ? "verified" : "encrypted"}>
                  {data.isVerified ? "✅ On-chain Verified" : "🔒 Encrypted"}
                </strong>
              </div>
            </div>
            
            <div className="usage-section">
              <h3>Energy Usage</h3>
              <div className="usage-display">
                {data.isVerified ? 
                  <div className="verified-usage">{data.decryptedValue} kWh</div> :
                  decryptedValue !== null ?
                  <div className="decrypted-usage">{decryptedValue} kWh (Local)</div> :
                  <div className="encrypted-usage">🔒 Encrypted Data</div>
                }
                <button 
                  className={`decrypt-btn ${(data.isVerified || decryptedValue !== null) ? 'decrypted' : ''}`}
                  onClick={handleDecrypt} 
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : 
                   data.isVerified ? "✅ Verified" : 
                   decryptedValue !== null ? "🔄 Re-verify" : "🔓 Verify"}
                </button>
              </div>
            </div>

            {(data.isVerified || decryptedValue !== null) && (
              <div className="analysis-section">
                <h3>Energy Analysis</h3>
                <div className="analysis-grid">
                  <div className="analysis-item">
                    <span>Community Average</span>
                    <strong>{stats.communityAvg} kWh</strong>
                  </div>
                  <div className="analysis-item">
                    <span>Your Usage</span>
                    <strong>{data.isVerified ? data.decryptedValue : decryptedValue} kWh</strong>
                  </div>
                  <div className="analysis-item">
                    <span>Efficiency</span>
                    <strong>{stats.efficiencyScore}%</strong>
                  </div>
                  <div className="analysis-item">
                    <span>Savings Potential</span>
                    <strong>${stats.savingsPotential}</strong>
                  </div>
                </div>
                <div className="recommendation">
                  <strong>Recommendation:</strong> {getRecommendation()}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;


