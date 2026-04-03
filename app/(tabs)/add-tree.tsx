import React, { useState } from 'react';
import { View, StyleSheet, Pressable, TextInput, ScrollView, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePhotos } from '@/context/PhotoContext';

export default function AddTreeScreen() {
  const { farmId } = useLocalSearchParams();
  const router = useRouter();
  const { setTreeDetails } = usePhotos();
  const farmName = `Farm-${farmId}`;

  const [treeId, setTreeId] = useState('');
  const [treeType, setTreeType] = useState('');
  const [datePlanted, setDatePlanted] = useState('');
  const [showTreeTypeDropdown, setShowTreeTypeDropdown] = useState(false);
  const [showPhotoPrompt, setShowPhotoPrompt] = useState(false);

  const treeTypes = ['Arabica', 'Robusta', 'Liberica'];

  const validateDate = (date: string): boolean => {
    // Check format mm-dd-yyyy
    const dateRegex = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-(\d{4})$/;
    if (!dateRegex.test(date)) {
      return false;
    }
    
    const [month, day, year] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    
    // Check if date is valid
    if (dateObj.getFullYear() !== year || 
        dateObj.getMonth() !== month - 1 || 
        dateObj.getDate() !== day) {
      return false;
    }
    
    // Check if date is not in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to midnight for accurate comparison
    dateObj.setHours(0, 0, 0, 0);
    
    if (dateObj > today) {
      return false;
    }
    
    return true;
  };

  const handleSubmit = () => {
    // Validate all fields
    if (!treeId.trim()) {
      Alert.alert('Validation Error', 'Please enter a Tree ID');
      return;
    }

    if (!treeType) {
      Alert.alert('Validation Error', 'Please select a Tree Type');
      return;
    }

    if (!datePlanted.trim()) {
      Alert.alert('Validation Error', 'Please enter the Date Planted');
      return;
    }

    if (!validateDate(datePlanted)) {
      Alert.alert('Validation Error', 'Please enter a valid date in mm-dd-yyyy format. Date cannot be in the future.');
      return;
    }

    // If all validations pass
    setShowPhotoPrompt(true);
  };

  const handleBackPress = () => {
    router.push(`/(tabs)/farm-map?farmId=${farmId}`);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBackPress}>
          <IconSymbol name="map" size={24} color="#000" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Add New Tree to {farmName}</ThemedText>
        <View style={styles.spacer} />
      </View>

      {/* Form Container */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.formContainer}>
          <ThemedText style={styles.formTitle}>Coffee Tree Monitoring Form</ThemedText>

          {/* Tree ID */}
          <View style={styles.fieldRow}>
            <ThemedText style={styles.rowLabel}>Tree ID:</ThemedText>
            <TextInput
              style={styles.rowInput}
              placeholder="Enter Tree ID"
              value={treeId}
              onChangeText={setTreeId}
              placeholderTextColor="#999"
            />
          </View>

          {/* Tree Type */}
          <View style={styles.fieldRow}>
            <ThemedText style={styles.rowLabel}>Tree Type:</ThemedText>
            <Pressable
              style={styles.rowDropdown}
              onPress={() => setShowTreeTypeDropdown(!showTreeTypeDropdown)}
            >
              <ThemedText style={treeType ? styles.dropdownText : styles.dropdownPlaceholder}>
                {treeType || 'Select Tree Type'}
              </ThemedText>
              <ThemedText style={styles.dropdownArrow}>▼</ThemedText>
            </Pressable>
          </View>

          {showTreeTypeDropdown && (
            <View style={styles.dropdownList}>
              {treeTypes.map((type) => (
                <Pressable
                  key={type}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setTreeType(type);
                    setShowTreeTypeDropdown(false);
                  }}
                >
                  <ThemedText style={styles.dropdownItemText}>{type}</ThemedText>
                </Pressable>
              ))}
            </View>
          )}

          {/* Date Planted */}
          <View style={styles.fieldRow}>
            <ThemedText style={styles.rowLabel}>Date Planted:</ThemedText>
            <View style={styles.dateInputContainer}>
              <TextInput
                style={styles.rowInput}
                placeholder="Enter Date Planted (mm-dd-yyyy)"
                value={datePlanted}
                onChangeText={setDatePlanted}
                placeholderTextColor="#999"
              />
            </View>
          </View>
        </View>

        {/* Submit Button - Outside the form container */}
        <Pressable style={styles.submitButton} onPress={handleSubmit}>
          <ThemedText style={styles.submitButtonText}>Submit</ThemedText>
        </Pressable>
      </ScrollView>

      {/* Photo guidance modal */}
      <Modal
        transparent
        animationType="fade"
        visible={showPhotoPrompt}
        onRequestClose={() => setShowPhotoPrompt(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>
              Before taking a photo, please ensure:
            </ThemedText>
            <View style={styles.modalList}>
              <ThemedText style={styles.modalBullet}>• Good lighting</ThemedText>
              <ThemedText style={styles.modalBullet}>• Leaf is centered and fully visible</ThemedText>
              <ThemedText style={styles.modalBullet}>• No shadows or overlapping leaves</ThemedText>
              <ThemedText style={styles.modalBullet}>• Camera held steady</ThemedText>
              <ThemedText style={styles.modalBullet}>• Clear background</ThemedText>
              <ThemedText style={styles.modalBullet}>• Leaf is from the same tagged tree</ThemedText>
            </View>
            <ThemedText style={styles.modalText}>Tap “Continue” when ready.</ThemedText>
            <Pressable
              style={styles.modalButton}
              onPress={() => {
                setShowPhotoPrompt(false);
                setTreeDetails({
                  treeId: treeId.trim(),
                  treeType,
                  datePlanted: datePlanted.trim(),
                });
                router.push({
                  pathname: '/(tabs)/camera-capture',
                  params: {
                    farmId: String(farmId),
                    treeId: treeId.trim(),
                    treeType,
                    datePlanted: datePlanted.trim(),
                  },
                });
              }}
            >
              <ThemedText style={styles.modalButtonText}>Continue</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F5E9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    position: 'relative',
  },
  backButton: {
    paddingLeft: 15,
  },
  spacer: {
    width: 24,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    paddingBottom: 60,
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    marginBottom: 24,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  rowInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000',
  },
  dateInputContainer: {
    flex: 1,
  },
  rowDropdown: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    fontSize: 14,
    color: '#000',
  },
  dropdownPlaceholder: {
    fontSize: 14,
    color: '#999',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#666',
  },
  dropdownList: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginTop: -12,
    marginBottom: 16,
    marginLeft: 100,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#000',
  },
  submitButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#000',
    width: 150,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  modalList: {
    marginBottom: 12,
    gap: 2,
  },
  modalBullet: {
    fontSize: 14,
    color: '#000',
  },
  modalText: {
    fontSize: 14,
    color: '#000',
    marginBottom: 16,
  },
  modalButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000',
    alignSelf: 'center',
    marginTop: 12,
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
});
